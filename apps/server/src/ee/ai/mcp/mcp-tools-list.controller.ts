import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { McpService } from './mcp.service';
import { WorkspaceAiToggleGuard } from '../guards/workspace-ai-toggle.guard';
import { RequireAiFeature } from '../guards/require-ai-feature.decorator';

@UseGuards(JwtAuthGuard, WorkspaceAiToggleGuard)
@RequireAiFeature('mcp')
@Controller('ai/mcp')
export class McpToolsListController {
  constructor(private readonly mcpService: McpService) {}

  @Get('tools')
  list(): {
    tools: {
      name: string;
      description: string;
      category: string;
      inputSchema: unknown;
    }[];
  } {
    return { tools: this.mcpService.getToolsCatalog() };
  }
}
