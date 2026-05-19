import { Module } from '@nestjs/common';
import { AiChatModule } from '../chat/ai-chat.module';
import { McpController } from './mcp.controller';
import { McpStreamController } from './mcp-stream.controller';
import { McpService } from './mcp.service';

@Module({
  imports: [AiChatModule],
  controllers: [McpController, McpStreamController],
  providers: [McpService],
})
export class McpModule {}
