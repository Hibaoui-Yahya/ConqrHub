import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';
import { GUIDE_SECTIONS } from '../../mcp/mcp-guide';

const SLUGS = GUIDE_SECTIONS.map((s) => s.slug) as [string, ...string[]];

/**
 * Serves the ConqrHub how-to-use guide on demand. The compact playbook is
 * always in context (MCP `instructions`), and these deeper sections are also
 * exposed as MCP resources — but exposing them as a tool means every client
 * (and the in-app Conqr AI chat) can pull detailed guidance even when it
 * doesn't surface MCP resources/prompts.
 */
@Injectable()
export class GetGuideTool implements ChatTool, OnModuleInit {
  readonly name = 'get_conqrhub_guide';
  readonly description =
    'Get detailed guidance on how to use the ConqrHub tools well for a given area. ' +
    'Call with no topic (or topic="overview") for an index and the golden rules, or a specific topic for a deep how-to. ' +
    `Topics: ${SLUGS.join(', ')}.`;

  readonly parameters = z.object({
    topic: z
      .enum(SLUGS)
      .optional()
      .describe(
        'Which guide section to read. Omit for the overview/index. ' +
          `One of: ${SLUGS.join(', ')}.`,
      ),
  });

  constructor(private readonly registry: ChatToolRegistry) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async execute(
    args: { topic?: string },
    _ctx: ChatToolContext,
  ): Promise<{ topic: string; title: string; content: string; availableTopics: string[] }> {
    const slug = args.topic ?? 'overview';
    const section =
      GUIDE_SECTIONS.find((s) => s.slug === slug) ??
      GUIDE_SECTIONS.find((s) => s.slug === 'overview')!;
    return {
      topic: section.slug,
      title: section.title,
      content: section.body,
      availableTopics: SLUGS,
    };
  }
}
