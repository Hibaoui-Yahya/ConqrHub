import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { PageService } from '../../../../core/page/services/page.service';
import { PageVerificationService } from '../../../page-verification/page-verification.service';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

@Injectable()
export class VerifyPageTool implements ChatTool, OnModuleInit {
  readonly name = 'verify_page';
  readonly description =
    'Verify a page so it enters the knowledge base and becomes retrievable by rag_retrieve / Ask HR. If the page has no verification yet, one is created automatically (you become its verifier). Requires space-manage permission. Retrieval is available seconds after verifying (embeddings are generated asynchronously).';
  readonly parameters = z.object({
    pageId: z.string().min(1).describe('The page UUID or short slugId.'),
    expiresInDays: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Optional: verification expires after N days (default: never).'),
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
    args: { pageId: string; expiresInDays?: number },
    ctx: ChatToolContext,
  ): Promise<{
    pageId: string;
    status: string;
    created: boolean;
    note: string;
  }> {
    const page = await this.pageService.findById(args.pageId, true);
    if (!page || page.workspaceId !== ctx.workspaceId) {
      throw new NotFoundException(
        `Page not found for id "${args.pageId}". Pass the page UUID or short slugId.`,
      );
    }
    const workspace = { id: ctx.workspaceId } as any;

    const info: any = await this.verification.getVerificationInfo(
      { pageId: page.id },
      ctx.user,
    );

    let created = false;
    if (info.status === 'none') {
      const dto: any = {
        pageId: page.id,
        type: 'expiring',
        verifierIds: [ctx.user.id],
        ...(args.expiresInDays
          ? {
              mode: 'period',
              periodAmount: args.expiresInDays,
              periodUnit: 'day',
            }
          : { mode: 'indefinite' }),
      };
      await this.verification.createVerification(dto, ctx.user, workspace);
      created = true;
    }

    await this.verification.verifyPage(page.id, ctx.user, workspace);

    return {
      pageId: page.id,
      status: 'verified',
      created,
      note: 'Verified. Embeddings are being generated; the page will be retrievable by rag_retrieve / Ask HR within seconds.',
    };
  }
}
