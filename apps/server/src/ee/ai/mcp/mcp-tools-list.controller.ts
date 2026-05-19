import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { McpService } from './mcp.service';

@UseGuards(JwtAuthGuard)
@Controller('ai/mcp')
export class McpToolsListController {
  constructor(private readonly mcpService: McpService) {}

  @Get('tools')
  list(): { tools: { name: string; description: string; category: string }[] } {
    return { tools: this.mcpService.getToolsCatalog() };
  }
}
