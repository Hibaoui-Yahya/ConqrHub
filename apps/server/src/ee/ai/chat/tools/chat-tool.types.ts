import { User } from '@docmost/db/types/entity.types';

export interface ChatToolContext {
  user: User;
  workspaceId: string;
}

export interface ChatTool {
  name: string;
  description: string;
  // zod schema for parameters — typed as any so each tool can import its own schema
  parameters: any;
  execute: (args: any, ctx: ChatToolContext) => Promise<unknown>;
}
