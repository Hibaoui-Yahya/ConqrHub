import { Module } from '@nestjs/common';
import { AiChatModule } from '../chat/ai-chat.module';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';

@Module({
  imports: [AiChatModule],
  controllers: [McpController],
  providers: [McpService],
})
export class McpModule {}
