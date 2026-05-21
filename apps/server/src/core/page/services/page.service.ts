import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreatePageDto, ContentFormat } from '../dto/create-page.dto';
import { ContentOperation, UpdatePageDto } from '../dto/update-page.dto';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { InsertablePage, Page, User } from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import {
  CursorPaginationResult,
  executeWithCursorPagination,
} from '@docmost/db/pagination/cursor-pagination';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import { MovePageDto } from '../dto/move-page.dto';
import { generateSlugId } from '../../../common/helpers';
import { getPageTitle } from '../../../common/helpers';
import { dbOrTx, executeTx } from '@docmost/db/utils';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { v7 as uuid7 } from 'uuid';
import {
  createYdocFromJson,
  getAttachmentIds,
  getProsemirrorContent,
  isAttachmentNode,
  removeMarkTypeFromDoc,
} from '../../../common/helpers/prosemirror/utils';
import {
  htmlToJson,
  jsonToNode,
  jsonToText,
} from 'src/collaboration/collaboration.util';
import {
  CopyPageMapEntry,
  ICopyPageAttachment,
} from '../dto/duplicate-page.dto';
import { Fragment, Mark, Node as PMNode } from '@tiptap/pm/model';
import { StorageService } from '../../../integrations/storage/storage.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueJob, QueueName } from '../../../integrations/queue/constants';
import { EventName } from '../../../common/events/event.contants';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CollaborationGateway } from '../../../collaboration/collaboration.gateway';
import {
  INTERNAL_LINK_REGEX,
  extractPageSlugId,
} from '../../../integrations/export/utils';
import { markdownToHtml } from '@docmost/editor-ext';
import { WatcherService } from '../../watcher/watcher.service';
import { sql } from 'kysely';

/**
 * Walks a ProseMirror tree and returns a new tree where any node for which
 * `transform` returns a non-null result is rebuilt via `node.type.create()`
 * with the requested attrs / marks. We never mutate `node.attrs` — those
 * are frozen by ProseMirror in strict mode, so the original code's
 * `node.attrs.foo = bar` pattern silently dropped on the floor in some
 * environments and produced corrupt duplicates.
 */
function transformProseMirrorTree(
  node: PMNode,
  transform: (
    node: PMNode,
  ) => {
    attrs?: Record<string, unknown> | null;
    marks?: readonly Mark[] | null;
  } | null,
): PMNode {
  const newChildren: PMNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    newChildren.push(transformProseMirrorTree(node.child(i), transform));
  }

  const change = transform(node);

  if (change && (change.attrs || change.marks)) {
    return node.type.create(
      (change.attrs ?? node.attrs) as Record<string, unknown>,
      Fragment.from(newChildren),
      (change.marks ?? node.marks) as readonly Mark[],
    );
  }

  if (node.isText) return node;
  return node.copy(Fragment.from(newChildren));
}

@Injectable()
export class PageService {
  private readonly logger = new Logger(PageService.name);

  constructor(
    private pageRepo: PageRepo,
    private pagePermissionRepo: PagePermissionRepo,
    private attachmentRepo: AttachmentRepo,
    @InjectKysely() private readonly db: KyselyDB,
    private readonly storageService: StorageService,
    @InjectQueue(QueueName.ATTACHMENT_QUEUE) private attachmentQueue: Queue,
    @InjectQueue(QueueName.AI_QUEUE) private aiQueue: Queue,
    @InjectQueue(QueueName.GENERAL_QUEUE) private generalQueue: Queue,
    private eventEmitter: EventEmitter2,
    private collaborationGateway: CollaborationGateway,
    private readonly watcherService: WatcherService,
  ) {}

  async findById(
    pageId: string,
    includeContent?: boolean,
    includeYdoc?: boolean,
    includeSpace?: boolean,
  ): Promise<Page> {
    return this.pageRepo.findById(pageId, {
      includeContent,
      includeYdoc,
      includeSpace,
    });
  }

  async create(
    userId: string,
    workspaceId: string,
    createPageDto: CreatePageDto,
  ): Promise<Page> {
    let parentPageId = undefined;

    // check if parent page exists
    if (createPageDto.parentPageId) {
      const parentPage = await this.pageRepo.findById(
        createPageDto.parentPageId,
      );

      if (
        !parentPage ||
        parentPage.deletedAt ||
        parentPage.spaceId !== createPageDto.spaceId
      ) {
        throw new NotFoundException('Parent page not found');
      }

      parentPageId = parentPage.id;
    }

    let content = undefined;
    let textContent = undefined;
    let ydoc = undefined;

    if (createPageDto?.content && createPageDto?.format) {
      const prosemirrorJson = await this.parseProsemirrorContent(
        createPageDto.content,
        createPageDto.format,
      );

      content = prosemirrorJson;
      textContent = jsonToText(prosemirrorJson);
      ydoc = createYdocFromJson(prosemirrorJson);
    }

    const page = await this.pageRepo.insertPage({
      slugId: generateSlugId(),
      title: createPageDto.title,
      position: await this.nextPagePosition(
        createPageDto.spaceId,
        parentPageId,
      ),
      icon: createPageDto.icon,
      parentPageId: parentPageId,
      spaceId: createPageDto.spaceId,
      creatorId: userId,
      workspaceId: workspaceId,
      lastUpdatedById: userId,
      content,
      textContent,
      ydoc,
    });

    this.generalQueue
      .add(QueueJob.ADD_PAGE_WATCHERS, {
        userIds: [userId],
        pageId: page.id,
        spaceId: createPageDto.spaceId,
        workspaceId,
      })
      .catch((err) =>
        this.logger.warn(`Failed to queue add-page-watchers: ${err.message}`),
      );

    return page;
  }

  async nextPagePosition(
    spaceId: string,
    parentPageId?: string,
    trx?: KyselyTransaction,
  ) {
    let pagePosition: string;

    // Run inside the caller's transaction so concurrent moves don't see
    // stale "last position" rows from a sibling that's mid-update.
    const db = dbOrTx(this.db, trx);
    const lastPageQuery = db
      .selectFrom('pages')
      .select(['position'])
      .where('spaceId', '=', spaceId)
      .where('deletedAt', 'is', null)
      .orderBy('position', (ob) => ob.collate('C').desc())
      .limit(1);

    if (parentPageId) {
      // check for children of this page
      const lastPage = await lastPageQuery
        .where('parentPageId', '=', parentPageId)
        .executeTakeFirst();

      if (!lastPage) {
        pagePosition = generateJitteredKeyBetween(null, null);
      } else {
        // if there is an existing page, we should get a position below it
        pagePosition = generateJitteredKeyBetween(lastPage.position, null);
      }
    } else {
      // for root page
      const lastPage = await lastPageQuery
        .where('parentPageId', 'is', null)
        .executeTakeFirst();

      // if no existing page, make this the first
      if (!lastPage) {
        pagePosition = generateJitteredKeyBetween(null, null); // we expect "a0"
      } else {
        // if there is an existing page, we should get a position below it
        pagePosition = generateJitteredKeyBetween(lastPage.position, null);
      }
    }

    return pagePosition;
  }

  async update(
    page: Page,
    updatePageDto: UpdatePageDto,
    user: User,
  ): Promise<Page> {
    const contributors = new Set<string>(page.contributorIds);
    contributors.add(user.id);
    const contributorIds = Array.from(contributors);

    await this.pageRepo.updatePage(
      {
        title: updatePageDto.title,
        icon: updatePageDto.icon,
        lastUpdatedById: user.id,
        updatedAt: new Date(),
        contributorIds: contributorIds,
      },
      page.id,
    );

    this.generalQueue
      .add(QueueJob.ADD_PAGE_WATCHERS, {
        userIds: [user.id],
        pageId: page.id,
        spaceId: page.spaceId,
        workspaceId: page.workspaceId,
      })
      .catch((err) =>
        this.logger.warn(`Failed to queue add-page-watchers: ${err.message}`),
      );

    if (
      updatePageDto.content &&
      updatePageDto.operation &&
      updatePageDto.format
    ) {
      await this.updatePageContent(
        page.id,
        updatePageDto.content,
        updatePageDto.operation,
        updatePageDto.format,
        user,
      );
    }

    return await this.pageRepo.findById(page.id, {
      includeSpace: true,
      includeContent: true,
      includeCreator: true,
      includeLastUpdatedBy: true,
      includeContributors: true,
    });
  }

  async updatePageContent(
    pageId: string,
    content: string | object,
    operation: ContentOperation,
    format: ContentFormat,
    user: User,
  ): Promise<void> {
    const prosemirrorJson = await this.parseProsemirrorContent(content, format);

    const documentName = `page.${pageId}`;
    await this.collaborationGateway.handleYjsEvent(
      'updatePageContent',
      documentName,
      { operation, prosemirrorJson, user },
    );
  }

  async getSidebarPages(
    spaceId: string,
    pagination: PaginationOptions,
    pageId?: string,
    userId?: string,
    spaceCanEdit?: boolean,
  ): Promise<CursorPaginationResult<Partial<Page> & { hasChildren: boolean }>> {
    let query = this.db
      .selectFrom('pages')
      .select([
        'id',
        'slugId',
        'title',
        'icon',
        'position',
        'parentPageId',
        'spaceId',
        'creatorId',
        'deletedAt',
      ])
      .select((eb) => this.pageRepo.withHasChildren(eb))
      .where('deletedAt', 'is', null)
      .where('spaceId', '=', spaceId);

    if (pageId) {
      query = query.where('parentPageId', '=', pageId);
    } else {
      query = query.where('parentPageId', 'is', null);
    }

    const result = await executeWithCursorPagination(query, {
      perPage: pagination.limit,
      cursor: pagination.cursor,
      beforeCursor: pagination.beforeCursor,
      fields: [
        {
          expression: 'position',
          direction: 'asc',
          orderModifier: (ob) => ob.collate('C').asc(),
        },
        { expression: 'id', direction: 'asc' },
      ],
      parseCursor: (cursor) => ({
        position: cursor.position,
        id: cursor.id,
      }),
    });

    if (userId && result.items.length > 0) {
      const hasRestrictions =
        await this.pagePermissionRepo.hasRestrictedPagesInSpace(spaceId);

      if (!hasRestrictions) {
        result.items = result.items.map((p: any) => ({
          ...p,
          canEdit: spaceCanEdit ?? true,
        }));
      } else {
        const pageIds = result.items.map((p: any) => p.id);

        const accessiblePages =
          await this.pagePermissionRepo.filterAccessiblePageIdsWithPermissions(
            pageIds,
            userId,
          );

        const permissionMap = new Map(
          accessiblePages.map((p) => [p.id, p.canEdit]),
        );

        result.items = result.items
          .filter((p: any) => permissionMap.has(p.id))
          .map((p: any) => ({
            ...p,
            canEdit: permissionMap.get(p.id) && (spaceCanEdit ?? true),
          }));

        const pagesWithChildren = result.items.filter(
          (p: any) => p.hasChildren,
        );
        if (pagesWithChildren.length > 0) {
          const parentIds = pagesWithChildren.map((p: any) => p.id);
          const parentsWithAccessibleChildren =
            await this.pagePermissionRepo.getParentIdsWithAccessibleChildren(
              parentIds,
              userId,
            );
          const hasAccessibleChildrenSet = new Set(
            parentsWithAccessibleChildren,
          );

          result.items = result.items.map((p: any) => ({
            ...p,
            hasChildren: p.hasChildren && hasAccessibleChildrenSet.has(p.id),
          }));
        }
      }
    }

    return result;
  }

  async movePageToSpace(rootPage: Page, spaceId: string, userId: string) {
    let childPageIds: string[] = [];

    const allPages = await this.pageRepo.getPageAndDescendants(rootPage.id, {
      includeContent: false,
    });

    // Filter to only accessible pages while maintaining tree integrity
    const accessiblePages = await this.filterAccessibleTreePages(
      allPages,
      rootPage.id,
      userId,
      rootPage.spaceId,
    );
    const accessibleIds = new Set(accessiblePages.map((p) => p.id));

    // Find inaccessible pages whose parent is being moved - these need to be orphaned
    const pagesToOrphan = allPages.filter(
      (p) =>
        !accessibleIds.has(p.id) &&
        p.parentPageId &&
        accessibleIds.has(p.parentPageId),
    );

    await executeTx(this.db, async (trx) => {
      // Orphan inaccessible child pages (make them root pages in original space)
      for (const page of pagesToOrphan) {
        const orphanPosition = await this.nextPagePosition(
          rootPage.spaceId,
          null,
          trx,
        );
        await this.pageRepo.updatePage(
          { parentPageId: null, position: orphanPosition },
          page.id,
          trx,
        );
      }

      // Update root page
      const nextPosition = await this.nextPagePosition(spaceId, undefined, trx);
      await this.pageRepo.updatePage(
        { spaceId, parentPageId: null, position: nextPosition },
        rootPage.id,
        trx,
      );

      const pageIdsToMove = accessiblePages.map((p) => p.id);

      childPageIds = pageIdsToMove.filter((id) => id !== rootPage.id);

      if (pageIdsToMove.length > 1) {
        // Update sub pages (all accessible pages except root)
        await this.pageRepo.updatePages(
          { spaceId },
          childPageIds,
          trx,
        );
      }

      if (pageIdsToMove.length > 0) {
        // Clear page-level permissions - moved pages inherit destination space permissions
        // (page_permissions cascade deletes via foreign key)
        await trx
          .deleteFrom('pageAccess')
          .where('pageId', 'in', pageIdsToMove)
          .execute();

        // update spaceId in shares
        await trx
          .updateTable('shares')
          .set({ spaceId: spaceId })
          .where('pageId', 'in', pageIdsToMove)
          .execute();

        // Update comments
        await trx
          .updateTable('comments')
          .set({ spaceId: spaceId })
          .where('pageId', 'in', pageIdsToMove)
          .execute();

        // Update page verifications
        await trx
          .updateTable('pageVerifications')
          .set({ spaceId: spaceId })
          .where('pageId', 'in', pageIdsToMove)
          .execute();

        // Update notifications — access follows the page after a move
        await trx
          .updateTable('notifications')
          .set({ spaceId: spaceId })
          .where('pageId', 'in', pageIdsToMove)
          .execute();

        // Update attachments
        await this.attachmentRepo.updateAttachmentsByPageId(
          { spaceId },
          pageIdsToMove,
          trx,
        );

        // Update watchers and remove those without access to new space
        await this.watcherService.movePageWatchersToSpace(pageIdsToMove, spaceId, {
          trx,
        });

        await this.aiQueue.add(QueueJob.PAGE_MOVED_TO_SPACE, {
          pageId: pageIdsToMove,
          workspaceId: rootPage.workspaceId,
        });
      }
    });

    return { childPageIds };
  }

  async duplicatePage(
    rootPage: Page,
    targetSpaceId: string | undefined,
    authUser: User,
  ) {
    const spaceId = targetSpaceId || rootPage.spaceId;
    const isDuplicateInSameSpace =
      !targetSpaceId || targetSpaceId === rootPage.spaceId;

    let nextPosition: string;

    if (isDuplicateInSameSpace) {
      // For duplicate in same space, position right after the original page
      nextPosition = generateJitteredKeyBetween(rootPage.position, null);
    } else {
      // For copy to different space, position at the end
      nextPosition = await this.nextPagePosition(spaceId);
    }

    const allPages = await this.pageRepo.getPageAndDescendants(rootPage.id, {
      includeContent: true,
    });

    // Filter to only accessible pages while maintaining tree integrity
    const pages = await this.filterAccessibleTreePages(
      allPages,
      rootPage.id,
      authUser.id,
      rootPage.spaceId,
    );

    const pageMap = new Map<string, CopyPageMapEntry>();
    pages.forEach((page) => {
      pageMap.set(page.id, {
        newPageId: uuid7(),
        newSlugId: generateSlugId(),
        oldSlugId: page.slugId,
      });
    });

    const slugIdMap = new Map<string, CopyPageMapEntry>();
    for (const [, entry] of pageMap) {
      slugIdMap.set(entry.oldSlugId, entry);
    }

    const attachmentMap = new Map<string, ICopyPageAttachment>();

    // Build a per-page attachmentId remap by scanning the source docs once.
    // Done before the rewrite pass so the rewriter can use the lookup table.
    pages.forEach((page) => {
      const pageContent = getProsemirrorContent(page.content);
      const attachmentIds = getAttachmentIds(pageContent);
      for (const attachmentId of attachmentIds) {
        if (attachmentMap.has(attachmentId)) continue;
        attachmentMap.set(attachmentId, {
          newPageId: pageMap.get(page.id)!.newPageId,
          oldPageId: page.id,
          oldAttachmentId: attachmentId,
          newAttachmentId: uuid7(),
        });
      }
    });

    const insertablePages: InsertablePage[] = await Promise.all(
      pages.map(async (page) => {
        const pageContent = getProsemirrorContent(page.content);
        const pageFromMap = pageMap.get(page.id);

        const doc = jsonToNode(pageContent);
        const prosemirrorDoc = removeMarkTypeFromDoc(doc, 'comment');

        // Walk the ProseMirror tree and rebuild any node whose attrs or
        // marks need rewriting by calling `node.type.create(...)`. We never
        // mutate `node.attrs` (frozen in strict mode — silently no-ops).
        const transformedDoc = transformProseMirrorTree(
          prosemirrorDoc,
          (node) => {
            let nextAttrs: Record<string, unknown> | null = null;
            let nextMarks: readonly Mark[] | null = null;

            // attachmentId / src rewrites for attachment-style nodes
            if (
              isAttachmentNode(node.type.name) &&
              node.attrs?.attachmentId &&
              attachmentMap.has(node.attrs.attachmentId)
            ) {
              const oldId = node.attrs.attachmentId as string;
              const mapped = attachmentMap.get(oldId)!;
              const newId = mapped.newAttachmentId;
              nextAttrs = { ...node.attrs, attachmentId: newId };
              if (typeof node.attrs.src === 'string') {
                nextAttrs.src = (node.attrs.src as string).replace(
                  oldId,
                  newId,
                );
              }
            }

            // mention -> page id remap when the referenced page is in scope
            if (
              node.type.name === 'mention' &&
              node.attrs?.entityType === 'page' &&
              node.attrs.entityId &&
              pageMap.has(node.attrs.entityId)
            ) {
              const mapped = pageMap.get(node.attrs.entityId as string)!;
              nextAttrs = {
                ...(nextAttrs ?? node.attrs),
                entityId: mapped.newPageId,
                slugId: mapped.newSlugId,
              };
            }

            // internal-link marks pointing to a copied page slug
            const linkRewrites: Mark[] = [];
            let marksChanged = false;
            for (const mark of node.marks) {
              if (
                mark.type.name === 'link' &&
                mark.attrs?.internal &&
                typeof mark.attrs.href === 'string'
              ) {
                const match = (mark.attrs.href as string).match(
                  INTERNAL_LINK_REGEX,
                );
                if (match) {
                  const slugId = extractPageSlugId(match[5]);
                  if (slugId && slugIdMap.has(slugId)) {
                    const mapped = slugIdMap.get(slugId)!;
                    linkRewrites.push(
                      mark.type.create({
                        ...mark.attrs,
                        href: (mark.attrs.href as string).replace(
                          slugId,
                          mapped.newSlugId,
                        ),
                      }),
                    );
                    marksChanged = true;
                    continue;
                  }
                }
              }
              linkRewrites.push(mark);
            }
            if (marksChanged) nextMarks = linkRewrites;

            return nextAttrs || nextMarks
              ? { attrs: nextAttrs, marks: nextMarks }
              : null;
          },
        );

        const prosemirrorJson = transformedDoc.toJSON();

        // Add "Copy of " prefix to the root page title only for duplicates in same space
        let title = page.title;
        if (isDuplicateInSameSpace && page.id === rootPage.id) {
          const originalTitle = getPageTitle(page.title);
          title = `Copy of ${originalTitle}`;
        }

        return {
          id: pageFromMap.newPageId,
          slugId: pageFromMap.newSlugId,
          title: title,
          icon: page.icon,
          content: prosemirrorJson,
          textContent: jsonToText(prosemirrorJson),
          ydoc: createYdocFromJson(prosemirrorJson),
          position: page.id === rootPage.id ? nextPosition : page.position,
          spaceId: spaceId,
          workspaceId: page.workspaceId,
          creatorId: authUser.id,
          lastUpdatedById: authUser.id,
          parentPageId:
            page.id === rootPage.id
              ? isDuplicateInSameSpace
                ? rootPage.parentPageId
                : null
              : page.parentPageId
                ? pageMap.get(page.parentPageId)?.newPageId
                : null,
        };
      }),
    );

    // Wrap the entire bulk insert + attachment-record creation in a single
    // transaction so a partial failure (constraint violation on one row,
    // network blip, etc.) rolls back cleanly — without this, the tree of
    // pages can land half-inserted and the source page ends up with
    // orphaned duplicates that aren't reachable via the tree but still
    // count against the workspace.
    const insertedPageIds = insertablePages.map((page) => page.id);
    const copiedFiles: string[] = [];

    try {
      await executeTx(this.db, async (trx) => {
        await trx.insertInto('pages').values(insertablePages).execute();

        const attachmentsIds = Array.from(attachmentMap.keys());
        if (attachmentsIds.length > 0) {
          const attachments = await trx
            .selectFrom('attachments')
            .selectAll()
            .where('id', 'in', attachmentsIds)
            .where('workspaceId', '=', rootPage.workspaceId)
            .execute();

          for (const attachment of attachments) {
            const pageAttachment = attachmentMap.get(attachment.id);
            if (!pageAttachment) continue;

            // ensure the source attachment belongs to the page it was copied from
            if (attachment.pageId !== pageAttachment.oldPageId) continue;

            const newAttachmentId = pageAttachment.newAttachmentId;
            const newPageId = pageAttachment.newPageId;
            const newPathFile = attachment.filePath.replace(
              attachment.id,
              newAttachmentId,
            );

            await this.storageService.copy(attachment.filePath, newPathFile);
            copiedFiles.push(newPathFile);

            await trx
              .insertInto('attachments')
              .values({
                id: newAttachmentId,
                type: attachment.type,
                filePath: newPathFile,
                fileName: attachment.fileName,
                fileSize: attachment.fileSize,
                mimeType: attachment.mimeType,
                fileExt: attachment.fileExt,
                creatorId: attachment.creatorId,
                workspaceId: attachment.workspaceId,
                pageId: newPageId,
                spaceId: spaceId,
              })
              .execute();
          }
        }
      });
    } catch (err) {
      // Best-effort cleanup of any storage objects we copied before the
      // transaction rolled back. DB rows are already gone (rollback).
      for (const path of copiedFiles) {
        try {
          await this.storageService.delete(path);
        } catch (cleanupErr) {
          this.logger.warn(
            `Failed to cleanup orphan storage path ${path} after duplicatePage rollback`,
            cleanupErr,
          );
        }
      }
      throw err;
    }

    this.eventEmitter.emit(EventName.PAGE_CREATED, {
      pageIds: insertedPageIds,
      workspaceId: authUser.workspaceId,
    });

    const newPageId = pageMap.get(rootPage.id).newPageId;
    const duplicatedPage = await this.pageRepo.findById(newPageId, {
      includeSpace: true,
    });

    const hasChildren = pages.length > 1;
    const childPageIds = insertedPageIds.filter((id) => id !== newPageId);

    return {
      ...duplicatedPage,
      hasChildren,
      childPageIds,
    };
  }

  async movePage(dto: MovePageDto, movedPage: Page) {
    // validate position value by attempting to generate a key
    try {
      generateJitteredKeyBetween(dto.position, null);
    } catch (err) {
      throw new BadRequestException('Invalid move position');
    }

    let parentPageId = null;
    if (movedPage.parentPageId === dto.parentPageId) {
      parentPageId = undefined;
    } else {
      // changing the page's parent
      if (dto.parentPageId) {
        const parentPage = await this.pageRepo.findById(dto.parentPageId);
        if (
          !parentPage ||
          parentPage.deletedAt ||
          parentPage.spaceId !== movedPage.spaceId
        ) {
          throw new NotFoundException('Parent page not found');
        }
        parentPageId = parentPage.id;
      }
    }

    await this.pageRepo.updatePage(
      {
        position: dto.position,
        parentPageId: parentPageId,
      },
      dto.pageId,
    );
  }

  async getPageBreadCrumbs(childPageId: string) {
    // Cap recursion depth so a circular parent chain (caused by any bug in
    // move/parent reassignment) cannot lock a connection running an
    // unbounded recursive CTE.
    const MAX_BREADCRUMB_DEPTH = 100;
    const ancestors = await this.db
      .withRecursive('page_ancestors', (db) =>
        db
          .selectFrom('pages')
          .select([
            'id',
            'slugId',
            'title',
            'icon',
            'position',
            'parentPageId',
            'spaceId',
            'deletedAt',
            sql<number>`1`.as('depth'),
          ])
          .where('id', '=', childPageId)
          .where('deletedAt', 'is', null)
          .unionAll((exp) =>
            exp
              .selectFrom('pages as p')
              .select([
                'p.id',
                'p.slugId',
                'p.title',
                'p.icon',
                'p.position',
                'p.parentPageId',
                'p.spaceId',
                'p.deletedAt',
                sql<number>`pa.depth + 1`.as('depth'),
              ])
              .innerJoin('page_ancestors as pa', 'pa.parentPageId', 'p.id')
              .where('p.deletedAt', 'is', null)
              .where(sql<boolean>`pa.depth < ${MAX_BREADCRUMB_DEPTH}`),
          ),
      )
      .selectFrom('page_ancestors')
      .selectAll('page_ancestors')
      .select((eb) =>
        eb.exists(
          eb
            .selectFrom('pages as child')
            .select(sql`1`.as('one'))
            .whereRef('child.parentPageId', '=', 'page_ancestors.id')
            .where('child.deletedAt', 'is', null),
        ).as('hasChildren'),
      )
      .execute();

    return ancestors.reverse();
  }

  async getRecentSpacePages(
    spaceId: string,
    userId: string,
    pagination: PaginationOptions,
  ): Promise<CursorPaginationResult<Page>> {
    const result = await this.pageRepo.getRecentPagesInSpace(
      spaceId,
      pagination,
    );

    if (result.items.length > 0) {
      const pageIds = result.items.map((p) => p.id);
      const accessibleIds =
        await this.pagePermissionRepo.filterAccessiblePageIds({
          pageIds,
          userId,
          spaceId,
        });
      const accessibleSet = new Set(accessibleIds);
      result.items = result.items.filter((p) => accessibleSet.has(p.id));
    }

    return result;
  }

  async getRecentPages(
    userId: string,
    pagination: PaginationOptions,
  ): Promise<CursorPaginationResult<Page>> {
    const result = await this.pageRepo.getRecentPages(userId, pagination);

    if (result.items.length > 0) {
      const pageIds = result.items.map((p) => p.id);
      const accessibleIds =
        await this.pagePermissionRepo.filterAccessiblePageIds({
          pageIds,
          userId,
        });
      const accessibleSet = new Set(accessibleIds);
      result.items = result.items.filter((p) => accessibleSet.has(p.id));
    }

    return result;
  }

  async getCreatedByPages(
    creatorId: string,
    requestingUserId: string,
    pagination: PaginationOptions,
    spaceId?: string,
  ): Promise<CursorPaginationResult<Page>> {
    const result = await this.pageRepo.getCreatedByPages(
      creatorId,
      requestingUserId,
      pagination,
      spaceId,
    );

    if (result.items.length > 0) {
      const pageIds = result.items.map((p) => p.id);
      const accessibleIds =
        await this.pagePermissionRepo.filterAccessiblePageIds({
          pageIds,
          userId: requestingUserId,
        });
      const accessibleSet = new Set(accessibleIds);
      result.items = result.items.filter((p) => accessibleSet.has(p.id));
    }

    return result;
  }

  async getDeletedSpacePages(
    spaceId: string,
    userId: string,
    pagination: PaginationOptions,
  ): Promise<CursorPaginationResult<Page>> {
    const result = await this.pageRepo.getDeletedPagesInSpace(
      spaceId,
      pagination,
    );

    if (result.items.length > 0) {
      const pageIds = result.items.map((p) => p.id);
      const accessibleIds =
        await this.pagePermissionRepo.filterAccessiblePageIds({
          pageIds,
          userId,
          spaceId,
        });
      const accessibleSet = new Set(accessibleIds);
      result.items = result.items.filter((p) => accessibleSet.has(p.id));
    }

    return result;
  }

  async forceDelete(pageId: string, workspaceId: string): Promise<void> {
    // Get all descendant IDs (including the page itself) using recursive CTE
    const descendants = await this.db
      .withRecursive('page_descendants', (db) =>
        db
          .selectFrom('pages')
          .select(['id'])
          .where('id', '=', pageId)
          .unionAll((exp) =>
            exp
              .selectFrom('pages as p')
              .select(['p.id'])
              .innerJoin('page_descendants as pd', 'pd.id', 'p.parentPageId'),
          ),
      )
      .selectFrom('page_descendants')
      .selectAll()
      .execute();

    const pageIds = descendants.map((d) => d.id);

    if (pageIds.length === 0) return;

    // Delete the page rows first. If the queue push below crashes (or the
    // process restarts), we don't end up with the rows still present but
    // their files already gone — which would render the pages as broken
    // 404s for every embedded attachment.
    await this.db.deleteFrom('pages').where('id', 'in', pageIds).execute();

    this.eventEmitter.emit(EventName.PAGE_DELETED, {
      pageIds: pageIds,
      workspaceId,
    });

    // Queue attachment cleanup as a post-commit side effect. Each job is
    // idempotent (jobId per pageId) so retries are safe.
    for (const id of pageIds) {
      await this.attachmentQueue.add(
        QueueJob.DELETE_PAGE_ATTACHMENTS,
        {
          pageId: id,
        },
        {
          jobId: `delete-page-attachments-${id}`,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        },
      );
    }
  }

  async removePage(
    pageId: string,
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    await this.pageRepo.removePage(pageId, userId, workspaceId);
  }

  private async parseProsemirrorContent(
    content: string | object,
    format: ContentFormat,
  ): Promise<any> {
    let prosemirrorJson: any;

    switch (format) {
      case 'markdown': {
        const html = await markdownToHtml(content as string);
        prosemirrorJson = htmlToJson(html as string);
        break;
      }
      case 'html': {
        prosemirrorJson = htmlToJson(content as string);
        break;
      }
      case 'json':
      default: {
        prosemirrorJson = content;
        break;
      }
    }

    try {
      jsonToNode(prosemirrorJson);
    } catch (err) {
      throw new BadRequestException('Invalid content format');
    }

    return prosemirrorJson;
  }

  /**
   * Filters a list of pages to only those accessible to the user while maintaining tree integrity.
   * A page is included only if:
   * 1. The user has access to it
   * 2. Its parent is also included (or it's the root page)
   * This ensures that if a middle page is inaccessible, its entire subtree is excluded.
   */
  private async filterAccessibleTreePages<
    T extends { id: string; parentPageId: string | null },
  >(
    pages: T[],
    rootPageId: string,
    userId: string,
    spaceId?: string,
  ): Promise<T[]> {
    if (pages.length === 0) return [];

    const pageIds = pages.map((p) => p.id);
    const accessibleIds = await this.pagePermissionRepo.filterAccessiblePageIds(
      {
        pageIds,
        userId,
        spaceId,
      },
    );
    const accessibleSet = new Set(accessibleIds);

    // Prune: include a page only if it's accessible AND its parent chain to root is included
    const includedIds = new Set<string>();

    // Process pages in a way that ensures parents are processed before children
    // We do this by iterating until no more pages can be added
    let changed = true;
    while (changed) {
      changed = false;
      for (const page of pages) {
        if (includedIds.has(page.id)) continue;
        if (!accessibleSet.has(page.id)) continue;

        // Root page: include if accessible
        if (page.id === rootPageId) {
          includedIds.add(page.id);
          changed = true;
          continue;
        }

        // Non-root: include if parent is already included
        if (page.parentPageId && includedIds.has(page.parentPageId)) {
          includedIds.add(page.id);
          changed = true;
        }
      }
    }

    return pages.filter((p) => includedIds.has(p.id));
  }
}
