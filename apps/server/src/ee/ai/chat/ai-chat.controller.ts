import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import * as bytes from 'bytes';
import { v7 as uuid7 } from 'uuid';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { WorkspaceAiToggleGuard } from '../guards/workspace-ai-toggle.guard';
import { RequireAiFeature } from '../guards/require-ai-feature.decorator';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { AiChatService } from './ai-chat.service';
import { ListChatsDto } from './dto/list-chats.dto';
import { ChatIdDto } from './dto/chat-id.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { SearchChatsDto } from './dto/search-chats.dto';
import { StorageService } from '../../../integrations/storage/storage.service';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { FileInterceptor } from '../../../common/interceptors/file.interceptor';
import {
  getAttachmentFolderPath,
  prepareFile,
} from '../../../core/attachment/attachment.utils';
import { AttachmentType } from '../../../core/attachment/attachment.constants';
import { createByteCountingStream } from '../../../common/helpers/utils';

@UseGuards(JwtAuthGuard, WorkspaceAiToggleGuard)
@RequireAiFeature('chat')
@Controller('ai/chats')
export class AiChatController {
  private readonly logger = new Logger(AiChatController.name);

  constructor(
    private readonly chatService: AiChatService,
    private readonly storageService: StorageService,
    private readonly attachmentRepo: AttachmentRepo,
    private readonly envService: EnvironmentService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('create')
  async create(@AuthUser() user: User) {
    return this.chatService.create(user);
  }

  @HttpCode(HttpStatus.OK)
  @Post()
  async list(@Body() dto: ListChatsDto, @AuthUser() user: User) {
    return this.chatService.list(dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('info')
  async info(@Body() dto: ChatIdDto, @AuthUser() user: User) {
    return this.chatService.info(dto.chatId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async delete(@Body() dto: ChatIdDto, @AuthUser() user: User) {
    await this.chatService.delete(dto.chatId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  async update(@Body() dto: UpdateChatDto, @AuthUser() user: User) {
    await this.chatService.update(dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('search')
  async search(@Body() dto: SearchChatsDto, @AuthUser() user: User) {
    return this.chatService.search(dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('upload')
  @UseInterceptors(FileInterceptor)
  async upload(
    @Req() req: FastifyRequest & { file: (opts?: unknown) => unknown },
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const maxFileSize = bytes(this.envService.getFileUploadSizeLimit());

    let fileData: any;
    try {
      fileData = await (req as any).file({
        limits: { fileSize: maxFileSize, fields: 2, files: 1 },
      });
    } catch (err: any) {
      if (err?.statusCode === 413) {
        throw new BadRequestException(
          `File too large. Exceeds the ${this.envService.getFileUploadSizeLimit()} limit`,
        );
      }
      throw new BadRequestException('Failed to process file upload');
    }

    if (!fileData) {
      throw new BadRequestException('No file provided');
    }

    const chatId: string | undefined = fileData.fields?.chatId?.value;

    const prepared = await prepareFile(Promise.resolve(fileData), {
      skipBuffer: true,
    });

    const attachmentId = uuid7();
    const filePath = `${getAttachmentFolderPath(AttachmentType.Chat, workspace.id)}/${attachmentId}/${prepared.fileName}`;

    const { stream, getBytesRead } = createByteCountingStream(
      fileData.file,
    );
    await this.storageService.uploadStream(filePath, stream);

    const attachment = await this.attachmentRepo.insertAttachment({
      id: attachmentId,
      fileName: prepared.fileName,
      filePath,
      fileSize: getBytesRead(),
      fileExt: prepared.fileExtension,
      mimeType: prepared.mimeType,
      type: AttachmentType.Chat,
      creatorId: user.id,
      workspaceId: workspace.id,
      aiChatId: chatId ?? null,
    });

    return {
      id: attachment.id,
      fileName: attachment.fileName,
      fileExt: attachment.fileExt,
      fileSize: attachment.fileSize,
      mimeType: attachment.mimeType,
    };
  }
}
