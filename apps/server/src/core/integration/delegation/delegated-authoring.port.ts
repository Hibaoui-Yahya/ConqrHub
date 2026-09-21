import type { DelegationContext } from '../services/suite-delegation-verifier.service';

export const DELEGATED_AUTHORING = Symbol('DELEGATED_AUTHORING');

export interface DelegatedAuthoringPort {
  listSpaces(ctx: DelegationContext, limit?: number): Promise<unknown>;
  readSpace(ctx: DelegationContext, id: string): Promise<unknown>;
  createSpace(ctx: DelegationContext, dto: unknown): Promise<unknown>;
  updateSpace(ctx: DelegationContext, dto: unknown): Promise<unknown>;
  searchPages(
    ctx: DelegationContext,
    query: string,
    limit?: number,
  ): Promise<unknown>;
  listPages(
    ctx: DelegationContext,
    spaceId: string,
    parentPageId?: string,
    limit?: number,
  ): Promise<unknown>;
  recentPages(ctx: DelegationContext, limit?: number): Promise<unknown>;
  readPage(ctx: DelegationContext, id: string): Promise<unknown>;
  breadcrumbs(ctx: DelegationContext, id: string): Promise<unknown>;
  history(ctx: DelegationContext, id: string, limit?: number): Promise<unknown>;
  createPage(ctx: DelegationContext, dto: unknown): Promise<unknown>;
  updatePage(ctx: DelegationContext, dto: unknown): Promise<unknown>;
  listComments(
    ctx: DelegationContext,
    pageId: string,
    limit?: number,
  ): Promise<unknown>;
  createComment(
    ctx: DelegationContext,
    pageId: string,
    text: string,
  ): Promise<unknown>;
  updateComment(
    ctx: DelegationContext,
    commentId: string,
    text: string,
  ): Promise<unknown>;
}
