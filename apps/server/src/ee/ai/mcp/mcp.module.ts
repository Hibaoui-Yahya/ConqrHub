import { Module } from '@nestjs/common';
import { AiChatModule } from '../chat/ai-chat.module';
import { McpController } from './mcp.controller';
import { McpStreamController } from './mcp-stream.controller';
import { McpToolsListController } from './mcp-tools-list.controller';
import { McpService } from './mcp.service';

@Module({
  imports: [AiChatModule],
  controllers: [McpController, McpStreamController, McpToolsListController],
  providers: [McpService],
})
export class McpModule {}
