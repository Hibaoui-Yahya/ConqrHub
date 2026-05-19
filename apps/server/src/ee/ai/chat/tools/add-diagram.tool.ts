import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { z } from 'zod';
import { PageService } from '../../../../core/page/services/page.service';
import SpaceAbilityFactory from '../../../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../../../core/casl/interfaces/space-ability.type';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

const DIAGRAM_TYPES = ['mermaid'] as const;
type DiagramType = (typeof DIAGRAM_TYPES)[number];

@Injectable()
export class AddDiagramTool implements ChatTool, OnModuleInit {
  readonly name = 'add_diagram';
  readonly description =
    'Add a diagram block to an existing ConqrHub page. ' +
    'Today only Mermaid diagrams are supported via this tool — pass the raw Mermaid source as `source`. ' +
    'Mermaid supports flowcharts, sequence, class, state, ERD, gantt, mindmap, gitGraph, and pie. ' +
    'Excalidraw and Drawio diagrams are not creatable via MCP yet because they require image attachment rendering; create those in the web UI. ' +
    'Use only when the user explicitly asks for a diagram or flowchart.';

  readonly parameters = z.object({
    pageId: z
      .string()
      .min(1)
      .describe('The page UUID or short slugId to add the diagram to.'),
    type: z
      .enum(DIAGRAM_TYPES)
      .describe('Diagram engine. Only "mermaid" is supported today.'),
    source: z
      .string()
      .min(1)
      .max(20000)
      .describe(
        'For mermaid: the diagram body, starting with a directive line like "flowchart LR" or "sequenceDiagram". Do NOT include surrounding ``` fences — the tool adds them.',
      ),
    caption: z
      .string()
      .optional()
      .describe(
        'Optional one-line caption rendered as a paragraph below the diagram.',
      ),
    position: z
      .enum(['append', 'prepend'])
      .optional()
      .default('append')
      .describe(
        'Whether to add the diagram at the end (default) or the start of the page.',
      ),
  });

  constructor(
    private readonly pageService: PageService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly registry: ChatToolRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async execute(
    args: {
      pageId: string;
      type: DiagramType;
      source: string;
      caption?: string;
      position?: 'append' | 'prepend';
    },
    ctx: ChatToolContext,
  ): Promise<{ success: true; pageId: string; type: DiagramType }> {
    const page = await this.pageService.findById(args.pageId, true);
    if (!page) {
      throw new NotFoundException(
        `Page not found for id "${args.pageId}". Pass either the page UUID or the short slugId returned by search_pages / list_pages.`,
      );
    }

    const ability = await this.spaceAbility.createForUser(ctx.user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException(
        'You do not have permission to edit this page',
      );
    }

    if (args.type !== 'mermaid') {
      throw new BadRequestException(
        `Diagram type "${args.type}" is not yet supported by MCP. Only "mermaid" can be created programmatically today.`,
      );
    }

    const trimmed = args.source.trim();
    if (trimmed.startsWith('```')) {
      throw new BadRequestException(
        'Pass the diagram body without surrounding ``` fences — the tool adds them.',
      );
    }

    let markdown = `\n\n\`\`\`mermaid\n${trimmed}\n\`\`\`\n`;
    if (args.caption) {
      markdown += `\n${args.caption.trim()}\n`;
    }

    await this.pageService.updatePageContent(
      page.id,
      markdown,
      (args.position ?? 'append') as any,
      'markdown',
      ctx.user,
    );

    return { success: true, pageId: page.id, type: args.type };
  }
}
