import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { ProjectSpaceMappingRepo } from '@docmost/db/repos/integration/project-space-mapping.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import {
  IntegrationProjectSpaceMapping,
  User,
} from '@docmost/db/types/entity.types';
import SpaceAbilityFactory from '../../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../casl/interfaces/space-ability.type';
import { IntegrationEventService } from './integration-event.service';
import { EventType } from '../domain/event-envelope';
import { buildUrn } from '../domain/urn.util';
import { EnvironmentService } from '../../../integrations/environment/environment.service';

export type MappingKind = 'primary' | 'secondary';

export interface SetMappingInput {
  workspaceId: string;
  actorId: string;
  planeProjectId: string;
  spaceId: string;
  mappingKind?: MappingKind;
}

/**
 * Many-to-many project↔space mapping with governance (blueprint §8.3): one
 * primary documentation space per Plane project, plus zero or more secondary
 * spaces. Mapping changes are audited and never move or delete content.
 */
@Injectable()
export class ProjectSpaceMappingService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly mappings: ProjectSpaceMappingRepo,
    private readonly spaceRepo: SpaceRepo,
    private readonly pageRepo: PageRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly events: IntegrationEventService,
    private readonly environment: EnvironmentService,
  ) {}

  async setMapping(
    input: SetMappingInput,
  ): Promise<IntegrationProjectSpaceMapping> {
    if (!input.planeProjectId?.trim()) {
      throw new BadRequestException('planeProjectId is required');
    }
    // The space must exist in the caller's workspace (tenant isolation).
    const space = await this.spaceRepo.findById(
      input.spaceId,
      input.workspaceId,
    );
    if (!space) {
      throw new NotFoundException('Space not found in this workspace');
    }

    const kind: MappingKind = input.mappingKind ?? 'primary';

    return executeTx(this.db, async (trx) => {
      // Demote an existing primary before promoting a new one — the partial
      // unique index guarantees at most one primary per project.
      if (kind === 'primary') {
        const currentPrimary = await this.mappings.getPrimaryForProject(
          input.workspaceId,
          input.planeProjectId,
          trx,
        );
        if (currentPrimary && currentPrimary.spaceId !== input.spaceId) {
          await this.mappings.softDelete(
            currentPrimary.id,
            input.workspaceId,
            trx,
          );
        }
      }

      const mapping = await this.mappings.insertIfAbsent(
        {
          workspaceId: input.workspaceId,
          planeProjectId: input.planeProjectId,
          spaceId: input.spaceId,
          mappingKind: kind,
          createdBy: input.actorId,
        },
        trx,
      );

      await this.events.record(
        {
          workspaceId: input.workspaceId,
          type: EventType.MappingChanged,
          source: 'hub',
          subject: buildUrn('plane', 'project', input.planeProjectId),
          actorId: input.actorId,
          data: { spaceId: input.spaceId, mappingKind: kind },
        },
        trx,
      );

      return mapping!;
    });
  }

  listForProject(workspaceId: string, planeProjectId: string) {
    return this.mappings.listForProject(workspaceId, planeProjectId);
  }

  /**
   * Resolve a Plane project's mapped ConqrHub documentation for the Plane Docs
   * area (blueprint §5.2A): the primary space plus any secondary spaces, each
   * with the deep link Plane navigates to. Deep links, not a broad iframe (§8.7).
   */
  async resolveProjectDocs(
    workspaceId: string,
    planeProjectId: string,
  ): Promise<{
    primary?: { spaceId: string; name: string; slug: string; url: string };
    secondary: { spaceId: string; name: string; slug: string; url: string }[];
  }> {
    const mappings = await this.mappings.listForProject(
      workspaceId,
      planeProjectId,
    );
    const toEntry = async (spaceId: string) => {
      const space = await this.spaceRepo.findById(spaceId, workspaceId);
      if (!space) return null;
      return {
        spaceId,
        name: space.name ?? space.slug,
        slug: space.slug,
        url: `/s/${space.slug}`,
      };
    };

    let primary:
      | { spaceId: string; name: string; slug: string; url: string }
      | undefined;
    const secondary: {
      spaceId: string;
      name: string;
      slug: string;
      url: string;
    }[] = [];
    for (const m of mappings) {
      const entry = await toEntry(m.spaceId);
      if (!entry) continue;
      if (m.mappingKind === 'primary') primary = entry;
      else secondary.push(entry);
    }
    return { primary, secondary };
  }

  /**
   * The Plane Docs area's data source (blueprint §5.2A): the project's mapped
   * spaces plus their most recently updated pages, permission-filtered per
   * space for the requesting user and returned with ABSOLUTE deep links (the
   * consumer renders inside Plane's origin). Spaces the user cannot read are
   * silently omitted — a link never grants access (§9.2).
   */
  async browseProjectDocs(
    workspaceId: string,
    user: User,
    planeProjectId: string,
  ): Promise<{
    spaces: { spaceId: string; name: string; deepLink: string; primary: boolean }[];
    pages: {
      pageId: string;
      slugId: string;
      title: string;
      spaceId: string;
      spaceName: string;
      updatedAt: string;
      deepLink: string;
    }[];
  }> {
    const appUrl = this.environment.getAppUrl().replace(/\/$/, '');
    const mappings = await this.mappings.listForProject(
      workspaceId,
      planeProjectId,
    );

    const spaces: {
      spaceId: string;
      name: string;
      deepLink: string;
      primary: boolean;
    }[] = [];
    const spaceSlugById = new Map<string, { slug: string; name: string }>();

    for (const m of mappings) {
      const space = await this.spaceRepo.findById(m.spaceId, workspaceId);
      if (!space) continue;
      const ability = await this.spaceAbility.createForUser(user, m.spaceId);
      if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) continue;
      spaceSlugById.set(m.spaceId, {
        slug: space.slug,
        name: space.name ?? space.slug,
      });
      spaces.push({
        spaceId: m.spaceId,
        name: space.name ?? space.slug,
        deepLink: `${appUrl}/s/${space.slug}`,
        primary: m.mappingKind === 'primary',
      });
    }
    // Primary first, stable otherwise.
    spaces.sort((a, b) => Number(b.primary) - Number(a.primary));

    const pages: {
      pageId: string;
      slugId: string;
      title: string;
      spaceId: string;
      spaceName: string;
      updatedAt: string;
      deepLink: string;
    }[] = [];
    for (const space of spaces) {
      const recent = await this.pageRepo.getRecentPagesInSpace(space.spaceId, {
        limit: 10,
      } as any);
      const info = spaceSlugById.get(space.spaceId)!;
      for (const page of (recent as any).rows ?? []) {
        pages.push({
          pageId: page.id,
          slugId: page.slugId,
          title: page.title ?? '',
          spaceId: space.spaceId,
          spaceName: info.name,
          updatedAt:
            page.updatedAt instanceof Date
              ? page.updatedAt.toISOString()
              : String(page.updatedAt),
          deepLink: `${appUrl}/s/${info.slug}/p/${page.slugId}`,
        });
      }
    }
    pages.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return { spaces, pages: pages.slice(0, 20) };
  }

  listForSpace(workspaceId: string, spaceId: string) {
    return this.mappings.listForSpace(workspaceId, spaceId);
  }

  listForWorkspace(workspaceId: string) {
    return this.mappings.listForWorkspace(workspaceId);
  }

  /**
   * Reverse of resolveProjectDocs: given a Hub space, find the Plane project it
   * maps to and build the deep link the app switcher jumps to (§7.4 context
   * preservation — "switching to Plane opens the mapped project, not its home").
   */
  async resolveSpacePlaneTarget(
    workspaceId: string,
    spaceId: string,
  ): Promise<{ planeProjectId?: string; url?: string }> {
    const mappings = await this.mappings.listForSpace(workspaceId, spaceId);
    if (mappings.length === 0) return {};
    // Prefer a primary mapping, else the first.
    const chosen =
      mappings.find((m) => m.mappingKind === 'primary') ?? mappings[0];
    const appUrl = this.environment.getPlaneAppUrl();
    const slug = this.environment.getPlaneWorkspaceSlug();
    if (!appUrl || !slug) return { planeProjectId: chosen.planeProjectId };
    return {
      planeProjectId: chosen.planeProjectId,
      url: `${appUrl}/${slug}/projects/${chosen.planeProjectId}/issues`,
    };
  }

  async removeMapping(
    workspaceId: string,
    id: string,
    actorId: string,
  ): Promise<void> {
    await executeTx(this.db, async (trx) => {
      await this.mappings.softDelete(id, workspaceId, trx);
      await this.events.record(
        {
          workspaceId,
          type: EventType.MappingChanged,
          source: 'hub',
          subject: `mapping:${id}`,
          actorId,
          data: { removed: true, mappingId: id },
        },
        trx,
      );
    });
  }
}
