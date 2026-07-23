import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { PageService } from '../../../../core/page/services/page.service';
import { PageVerificationService } from '../../../page-verification/page-verification.service';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

const RETRIEVABLE = new Set(['verified', 'expiring']);

@Injectable()
export class GetVerificationStatusTool implements ChatTool, OnModuleInit {
  readonly name = 'get_verification_status';
  readonly description =
    "Get a page's verification status and whether it is currently in the knowledge base (retrievable by rag_retrieve / Ask HR). A page is retrievable ONLY when verified. Accepts the page UUID or short slugId.";
  readonly parameters = z.object({
    pageId: z.string().min(1).describe('The page UUID or short slugId.'),
  });

  constructor(
    private readonly pageService: PageService,
    private readonly verification: PageVerificationService,
    private readonly registry: ChatToolRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async execute(
    args: { pageId: string },
    ctx: ChatToolContext,
  ): Promise<{
    pageId: string;
    status: string;
    inRag: boolean;
    permissions: unknown;
  }> {
    const page = await this.pageService.findById(args.pageId, true);
    if (!page || page.workspaceId !== ctx.workspaceId) {
      throw new NotFoundException(
        `Page not found for id "${args.pageId}". Pass the page UUID or short slugId.`,
      );
    }
    const info: any = await this.verification.getVerificationInfo(
      { pageId: page.id },
      ctx.user,
    );
    return {
      pageId: page.id,
      status: info.status,
      inRag: RETRIEVABLE.has(info.status),
      permissions: info.permissions,
    };
  }
}
