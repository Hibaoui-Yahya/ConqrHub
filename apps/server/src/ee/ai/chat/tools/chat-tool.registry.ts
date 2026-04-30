import { Injectable } from '@nestjs/common';
import { ToolSet } from 'ai';
import { ChatTool, ChatToolContext } from './chat-tool.types';

@Injectable()
export class ChatToolRegistry {
  private readonly tools: ChatTool[] = [];

  register(chatTool: ChatTool): void {
    this.tools.push(chatTool);
  }

  /**
   * Converts the registry into a ToolSet that the AI SDK's
   * `streamText({ tools })` parameter expects.
   * Each tool's `execute` is closed over the provided context so the
   * model can never invoke a tool as a different user.
   */
  toAiSdkTools(ctx: ChatToolContext): ToolSet {
    const result: ToolSet = {};
    for (const t of this.tools) {
      // `tool()` is a type-only identity; construct the shape directly since
      // parameters is dynamically typed and can't satisfy the overload generics.
      result[t.name] = {
        description: t.description,
        parameters: t.parameters,
        execute: (args: any) => t.execute(args, ctx),
      } as any;
    }
    return result;
  }

  getAll(): ReadonlyArray<ChatTool> {
    return this.tools;
  }
}
