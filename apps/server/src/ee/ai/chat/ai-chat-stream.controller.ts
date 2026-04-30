import {
  Body,
  Controller,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { WorkspaceAiToggleGuard } from '../guards/workspace-ai-toggle.guard';
import { RequireAiFeature } from '../guards/require-ai-feature.decorator';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { User } from '@docmost/db/types/entity.types';
import { AiChatStreamService } from './ai-chat-stream.service';
import { SendMessageDto } from './dto/send-message.dto';

@UseGuards(JwtAuthGuard, WorkspaceAiToggleGuard)
@RequireAiFeature('chat')
@Controller('ai/chats')
export class AiChatStreamController {
  constructor(private readonly streamService: AiChatStreamService) {}

  @Post('send')
  async send(
    @Body() dto: SendMessageDto,
    @AuthUser() user: User,
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    await this.streamService.send(dto, user, reply);
  }
}
