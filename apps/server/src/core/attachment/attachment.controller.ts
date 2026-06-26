import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AttachmentService } from './services/attachment.service';
import { FastifyReply, FastifyRequest } from 'fastify';
import { FileInterceptor } from '../../common/interceptors/file.interceptor';
import * as bytes from 'bytes';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Attachment, User, Workspace } from '@docmost/db/types/entity.types';
import { StorageService } from '../../integrations/storage/storage.service';
import {
  getAttachmentFolderPath,
  validAttachmentTypes,
} from './attachment.utils';
import { getMimeType } from '../../common/helpers';
import {
  AttachmentType,
  inlineFileExtensions,
  MAX_AVATAR_SIZE,
} from './attachment.constants';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../casl/interfaces/workspace-ability.type';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { validate as isValidUUID } from 'uuid';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { TokenService } from '../auth/services/token.service';
import { JwtAttachmentPayload, JwtType } from '../auth/dto/jwt-payload';
import * as path from 'path';
import { AttachmentInfoDto, RemoveIconDto } from './dto/attachment.dto';
import { PageAccessService } from '../page/page-access/page-access.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';

@Controller()
export class AttachmentController {
  private readonly logger = new Logger(AttachmentController.name);

  constructor(
    private readonly attachmentService: AttachmentService,
    private readonly storageService: StorageService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly pageRepo: PageRepo,
    private readonly attachmentRepo: AttachmentRepo,
    private readonly environmentService: EnvironmentService,
    private readonly tokenService: TokenService,
    private readonly pageAccessService: PageAccessService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('files/upload')
  @UseInterceptors(FileInterceptor)
  async uploadFile(
    @Req() req: any,
    @Res() res: FastifyReply,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const maxFileSize = bytes(this.environmentService.getFileUploadSizeLimit());

    let file = null;
    try {
      file = await req.file({
        limits: { fileSize: maxFileSize, fields: 3, files: 1 },
      });
    } catch (err: any) {
      this.logger.error(err.message);
      if (err?.statusCode === 413) {
        throw new BadRequestException(
          `File too large. Exceeds the ${this.environmentService.getFileUploadSizeLimit()} limit`,
        );
      }
    }

    if (!file) {
      throw new BadRequestException('Failed to upload file');
    }

    const pageId = file.fields?.pageId?.value;

    if (!pageId) {
      throw new BadRequestException('PageId is required');
    }

    const page = await this.pageRepo.findById(pageId);

    if (!page) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanEdit(page, user);

    const spaceId = page.spaceId;

    const attachmentId = file.fields?.attachmentId?.value;
    if (attachmentId && !isValidUUID(attachmentId)) {
      throw new BadRequestException('Invalid attachment id');
    }

    try {
      const fileResponse = await this.attachmentService.uploadFile({
        filePromise: file,
        pageId: pageId,
        spaceId: spaceId,
        userId: user.id,
        workspaceId: workspace.id,
        attachmentId: attachmentId,
      });

      this.auditService.log({
        event: AuditEvent.ATTACHMENT_UPLOADED,
        resourceType: AuditResource.ATTACHMENT,
        resourceId: fileResponse?.id ?? attachmentId,
        spaceId,
        metadata: {
          fileName: fileResponse?.fileName,
          pageId,
          spaceId,
        },
      });

      return res.send(fileResponse);
    } catch (err: any) {
      if (err?.statusCode === 413) {
        const errMessage = `File too large. Exceeds the ${this.environmentService.getFileUploadSizeLimit()} limit`;
        this.logger.error(errMessage);
        throw new BadRequestException(errMessage);
      }
      this.logger.error(err);
      throw new BadRequestException('Error processing file upload.');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('/files/:fileId/:fileName')
  async getFile(
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Param('fileId') fileId: string,
    @Param('fileName') fileName?: string,
  ) {
    if (!isValidUUID(fileId)) {
      throw new NotFoundException('Invalid file id');
    }

    const attachment = await this.attachmentRepo.findById(fileId, workspace.id);
    if (!attachment) {
      throw new NotFoundException();
    }

    if (attachment.aiChatId) {
      // Chat-owned attachment: only the user who uploaded (and therefore
      // owns the chat, per AttachmentRepo.claimAttachmentsForChat) can
      // read it back.
      if (attachment.creatorId !== user.id) {
        throw new NotFoundException();
      }
    } else {
      if (!attachment.pageId || !attachment.spaceId) {
        throw new NotFoundException();
      }

      const page = await this.pageRepo.findById(attachment.pageId);
      if (!page) {
        throw new NotFoundException();
      }

      await this.pageAccessService.validateCanView(page, user);
    }

    try {
      return await this.sendFileResponse(req, res, attachment, 'private');
    } catch (err) {
      this.logger.error(err);
      throw new NotFoundException('File not found');
    }
  }

  @Get('/files/public/:fileId/:fileName')
  async getPublicFile(
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
    @AuthWorkspace() workspace: Workspace,
    @Param('fileId') fileId: string,
    @Param('fileName') fileName?: string,
    @Query('jwt') jwtToken?: string,
  ) {
    let jwtPayload: JwtAttachmentPayload = null;
    try {
      jwtPayload = await this.tokenService.verifyJwt(
        jwtToken,
        JwtType.ATTACHMENT,
      );
    } catch (err) {
      throw new BadRequestException(
        'Expired or invalid attachment access token',
      );
    }

    if (
      !isValidUUID(fileId) ||
      fileId !== jwtPayload.attachmentId ||
      jwtPayload.workspaceId !== workspace.id
    ) {
      throw new NotFoundException('File not found');
    }

    const attachment = await this.attachmentRepo.findById(fileId, workspace.id);
    if (
      !attachment ||
      !attachment.pageId ||
      !attachment.spaceId ||
      jwtPayload.pageId !== attachment.pageId
    ) {
      throw new NotFoundException('File not found');
    }

    // Ensure the originating page is still live — a previously-issued
    // attachment JWT must not outlive deletion of its page.
    const page = await this.pageRepo.findById(attachment.pageId);
    if (!page || page.deletedAt || page.workspaceId !== workspace.id) {
      throw new NotFoundException('File not found');
    }

    try {
      return await this.sendFileResponse(req, res, attachment, 'public');
    } catch (err) {
      this.logger.error(err);
      throw new NotFoundException('File not found');
    }
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('attachments/upload-image')
  @UseInterceptors(FileInterceptor)
  async uploadAvatarOrLogo(
    @Req() req: any,
    @Res() res: FastifyReply,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const maxFileSize = bytes(MAX_AVATAR_SIZE);

    let file = null;
    try {
      file = await req.file({
        limits: { fileSize: maxFileSize, fields: 3, files: 1 },
      });
    } catch (err: any) {
      if (err?.statusCode === 413) {
        throw new BadRequestException(
          `File too large. Exceeds the ${MAX_AVATAR_SIZE} limit`,
        );
      }
    }

    if (!file) {
      throw new BadRequestException('Invalid file upload');
    }

    const attachmentType = file.fields?.type?.value;
    const spaceId = file.fields?.spaceId?.value;

    if (!attachmentType) {
      throw new BadRequestException('attachment type is required');
    }

    if (
      !validAttachmentTypes.includes(attachmentType) ||
      attachmentType === AttachmentType.File
    ) {
      throw new BadRequestException('Invalid image attachment type');
    }

    if (attachmentType === AttachmentType.WorkspaceIcon) {
      const ability = this.workspaceAbility.createForUser(user, workspace);
      if (
        ability.cannot(
          WorkspaceCaslAction.Manage,
          WorkspaceCaslSubject.Settings,
        )
      ) {
        throw new ForbiddenException();
      }
    }

    if (attachmentType === AttachmentType.SpaceIcon) {
      if (!spaceId) {
        throw new BadRequestException('spaceId is required');
      }

      const spaceAbility = await this.spaceAbility.createForUser(user, spaceId);
      if (
        spaceAbility.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)
      ) {
        throw new ForbiddenException();
      }
    }

    try {
      const fileResponse = await this.attachmentService.uploadImage(
        file,
        attachmentType,
        user.id,
        workspace.id,
        spaceId,
      );

      return res.send(fileResponse);
    } catch (err: any) {
      this.logger.error(err);
      throw new BadRequestException('Error processing file upload.');
    }
  }

  private validateImgFileName(fileName: string | undefined): void {
    if (!fileName) {
      throw new BadRequestException('Invalid file name');
    }
    const ext = path.extname(fileName);
    const filenameWithoutExt = path.basename(fileName, ext);
    if (
      !ext ||
      !isValidUUID(filenameWithoutExt) ||
      `${filenameWithoutExt}${ext}` !== fileName
    ) {
      throw new BadRequestException('Invalid file name');
    }
  }

  private async streamImage(
    res: FastifyReply,
    filePath: string,
    cacheControl: string,
  ) {
    try {
      const fileStream = await this.storageService.readStream(filePath);
      res.headers({
        'Content-Type': getMimeType(filePath),
        'Cache-Control': cacheControl,
        'X-Content-Type-Options': 'nosniff',
      });
      return res.send(fileStream);
    } catch (err) {
      throw new NotFoundException('File not found');
    }
  }

  /**
   * Public workspace / space icon endpoint.
   *
   * Serves only the two image kinds that are intentionally embedded in
   * public surfaces (workspace logos, space icons). User avatars MUST use
   * the protected `/attachments/img/user/:fileName` endpoint instead —
   * the old combined endpoint leaked avatars to unauthenticated parties.
   */
  @Get('attachments/img/workspace/:fileName')
  async getWorkspaceImage(
    @Res() res: FastifyReply,
    @AuthWorkspace() workspace: Workspace,
    @Param('fileName') fileName?: string,
  ) {
    this.validateImgFileName(fileName);
    // Try workspace icon path first, then space icon. Either is acceptable
    // here — both are by-design public, both are scoped to the workspace.
    const candidates = [
      `${getAttachmentFolderPath(AttachmentType.WorkspaceIcon, workspace.id)}/${fileName}`,
      `${getAttachmentFolderPath(AttachmentType.SpaceIcon, workspace.id)}/${fileName}`,
    ];
    for (const filePath of candidates) {
      try {
        const fileStream = await this.storageService.readStream(filePath);
        res.headers({
          'Content-Type': getMimeType(filePath),
          'Cache-Control': 'public, max-age=86400',
          'X-Content-Type-Options': 'nosniff',
        });
        return res.send(fileStream);
      } catch {
        // try next candidate
      }
    }
    throw new NotFoundException('File not found');
  }

  /**
   * Protected user-avatar endpoint. JwtAuthGuard ensures only authenticated
   * workspace members can fetch avatar bytes, which may carry PII.
   */
  @UseGuards(JwtAuthGuard)
  @Get('attachments/img/user/:fileName')
  async getUserAvatar(
    @Res() res: FastifyReply,
    @AuthWorkspace() workspace: Workspace,
    @Param('fileName') fileName?: string,
  ) {
    this.validateImgFileName(fileName);
    const filePath = `${getAttachmentFolderPath(AttachmentType.Avatar, workspace.id)}/${fileName}`;
    return this.streamImage(res, filePath, 'private, max-age=86400');
  }

  /**
   * Legacy combined endpoint serving WorkspaceIcon, SpaceIcon AND Avatar
   * under a single path. Kept publicly-accessible for backwards
   * compatibility with existing avatar URLs already embedded in page
   * HTML/markdown and stored in public shares — breaking those URLs in
   * this release would surface as silent missing-image regressions in
   * customer content.
   *
   * The new endpoints (above) are the canonical paths going forward:
   *   - workspace/space icons: GET /attachments/img/workspace/:fileName
   *   - user avatars:          GET /attachments/img/user/:fileName  (auth-required)
   *
   * TODO: enforce auth on the Avatar variant of this legacy route after
   * all existing embedded URLs are migrated to /attachments/img/user/:fileName.
   * Target: next minor release. Tracked as a conscious security trade-off —
   * user avatars remain publicly readable via the legacy URL pattern until
   * then, matching the pre-audit behavior.
   */
  @Get('attachments/img/:attachmentType/:fileName')
  async getLogoOrAvatar(
    @Res() res: FastifyReply,
    @AuthWorkspace() workspace: Workspace,
    @Param('attachmentType') attachmentType: AttachmentType,
    @Param('fileName') fileName?: string,
  ) {
    if (
      !validAttachmentTypes.includes(attachmentType) ||
      attachmentType === AttachmentType.File
    ) {
      throw new BadRequestException('Invalid image attachment type');
    }

    this.validateImgFileName(fileName);

    const filePath = `${getAttachmentFolderPath(attachmentType, workspace.id)}/${fileName}`;
    const cacheControl =
      attachmentType === AttachmentType.Avatar
        ? 'private, max-age=86400'
        : 'public, max-age=86400';
    return this.streamImage(res, filePath, cacheControl);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('files/info')
  async getAttachmentInfo(
    @Body() dto: AttachmentInfoDto,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    const attachment = await this.attachmentRepo.findById(
      dto.attachmentId,
      workspace.id,
    );
    if (
      !attachment ||
      !attachment.pageId ||
      attachment.type !== AttachmentType.File
    ) {
      throw new NotFoundException('File not found');
    }

    const page = await this.pageRepo.findById(attachment.pageId);
    if (!page) {
      throw new NotFoundException('File not found');
    }

    await this.pageAccessService.validateCanView(page, user);

    return attachment;
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('attachments/remove-icon')
  async removeIcon(
    @Body() dto: RemoveIconDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const { type, spaceId } = dto;

    // remove current user avatar
    if (type === AttachmentType.Avatar) {
      await this.attachmentService.removeUserAvatar(user);
      return;
    }

    // remove space icon
    if (type === AttachmentType.SpaceIcon) {
      if (!spaceId) {
        throw new BadRequestException(
          'spaceId is required to change space icons',
        );
      }

      const spaceAbility = await this.spaceAbility.createForUser(user, spaceId);
      if (
        spaceAbility.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)
      ) {
        throw new ForbiddenException();
      }

      await this.attachmentService.removeSpaceIcon(spaceId, workspace.id);
      return;
    }

    // remove workspace icon
    if (type === AttachmentType.WorkspaceIcon) {
      const ability = this.workspaceAbility.createForUser(user, workspace);
      if (
        ability.cannot(
          WorkspaceCaslAction.Manage,
          WorkspaceCaslSubject.Settings,
        )
      ) {
        throw new ForbiddenException();
      }
      await this.attachmentService.removeWorkspaceIcon(workspace);
      return;
    }
  }

  private async sendFileResponse(
    req: FastifyRequest,
    res: FastifyReply,
    attachment: Attachment,
    cacheScope: 'private' | 'public',
  ) {
    const fileSize = Number(attachment.fileSize);
    const rangeHeader = req.headers.range;

    res.header('Accept-Ranges', 'bytes');
    res.header(
      'Content-Security-Policy',
      "base-uri 'none'; object-src 'self'; default-src 'self';",
    );
    res.header('X-Content-Type-Options', 'nosniff');

    // SVG files can carry inline JavaScript via <script> or <foreignObject>.
    // Force download so they're never rendered inline from our origin.
    const isSvg = attachment.fileExt === '.svg';
    if (isSvg || !inlineFileExtensions.includes(attachment.fileExt)) {
      res.header(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(attachment.fileName)}"`,
      );
    }

    if (rangeHeader && fileSize) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2]
          ? Math.min(parseInt(match[2], 10), fileSize - 1)
          : fileSize - 1;

        if (start >= fileSize || start > end) {
          res.status(416);
          res.header('Content-Range', `bytes */${fileSize}`);
          return res.send();
        }

        const fileStream = await this.storageService.readRangeStream(
          attachment.filePath,
          { start, end },
        );

        res.status(206);
        res.headers({
          'Content-Type': attachment.mimeType,
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Content-Length': end - start + 1,
          'Cache-Control': `${cacheScope}, max-age=3600`,
        });

        return res.send(fileStream);
      }
    }

    const fileStream = await this.storageService.readStream(
      attachment.filePath,
    );

    res.headers({
      'Content-Type': attachment.mimeType,
      'Cache-Control': `${cacheScope}, max-age=3600`,
    });

    if (fileSize && !isSvg) {
      res.header('Content-Length', fileSize);
    }

    return res.send(fileStream);
  }
}
