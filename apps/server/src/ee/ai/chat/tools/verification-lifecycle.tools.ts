import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { PageService } from '../../../../core/page/services/page.service';
import { PageVerificationService } from '../../../page-verification/page-verification.service';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

async function resolvePageId(
  pageService: PageService,
  pageId: string,
  workspaceId: string,
): Promise<string> {
  const page = await pageService.findById(pageId, true);
  if (!page || page.workspaceId !== workspaceId) {
    throw new NotFoundException(
      `Page not found for id "${pageId}". Pass the page UUID or short slugId.`,
    );
  }
  return page.id;
}

@Injectable()
export class CreateVerificationTool implements ChatTool, OnModuleInit {
  readonly name = 'create_verification';
  readonly description =
    'Create a verification on a page (does NOT verify it yet — use verify_page for the one-step path, or submit_for_approval for the QMS flow). Defaults: type "expiring", never expires, you as sole verifier.';
  readonly parameters = z.object({
    pageId: z.string().min(1).describe('The page UUID or short slugId.'),
    type: z
      .enum(['expiring', 'qms'])
      .optional()
      .describe('Verification type (default expiring).'),
    verifierIds: z
      .array(z.string())
      .optional()
      .describe('User UUIDs allowed to verify (default: you).'),
    expiresInDays: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Optional: expires after N days (default never).'),
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
    args: {
      pageId: string;
      type?: 'expiring' | 'qms';
      verifierIds?: string[];
      expiresInDays?: number;
    },
    ctx: ChatToolContext,
  ): Promise<{ pageId: string; status: string }> {
    const pageId = await resolvePageId(
      this.pageService,
      args.pageId,
      ctx.workspaceId,
    );
    const dto: any = {
      pageId,
      type: args.type ?? 'expiring',
      verifierIds: args.verifierIds ?? [ctx.user.id],
      ...(args.expiresInDays
        ? { mode: 'period', periodAmount: args.expiresInDays, periodUnit: 'day' }
        : { mode: 'indefinite' }),
    };
    await this.verification.createVerification(dto, ctx.user, {
      id: ctx.workspaceId,
    } as any);
    return { pageId, status: 'draft' };
  }
}

@Injectable()
export class SubmitForApprovalTool implements ChatTool, OnModuleInit {
  readonly name = 'submit_for_approval';
  readonly description =
    'Submit a draft QMS verification for approval. Only valid for pages whose verification is in draft status.';
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
  ): Promise<{ pageId: string; status: string }> {
    const pageId = await resolvePageId(
      this.pageService,
      args.pageId,
      ctx.workspaceId,
    );
    await this.verification.submitForApproval(pageId, ctx.user);
    return { pageId, status: 'in_approval' };
  }
}

@Injectable()
export class MarkObsoleteTool implements ChatTool, OnModuleInit {
  readonly name = 'mark_obsolete';
  readonly description =
    "Mark a page's verification obsolete. This removes the page from the knowledge base (it will no longer be retrievable by rag_retrieve / Ask HR). Requires space-manage permission.";
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
  ): Promise<{ pageId: string; status: string; note: string }> {
    const pageId = await resolvePageId(
      this.pageService,
      args.pageId,
      ctx.workspaceId,
    );
    await this.verification.markObsolete(pageId, ctx.user, {
      id: ctx.workspaceId,
    } as any);
    return {
      pageId,
      status: 'obsolete',
      note: 'Marked obsolete and removed from the knowledge base.',
    };
  }
}

export const VERIFICATION_LIFECYCLE_TOOLS = [
  CreateVerificationTool,
  SubmitForApprovalTool,
  MarkObsoleteTool,
];
