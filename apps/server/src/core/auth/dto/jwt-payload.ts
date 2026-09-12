export enum JwtType {
  ACCESS = 'access',
  COLLAB = 'collab',
  EXCHANGE = 'exchange',
  ATTACHMENT = 'attachment',
  MFA_TOKEN = 'mfa_token',
  API_KEY = 'api_key',
  PDF_RENDER = 'pdf_render',
  PDF_EXPORT_DOWNLOAD = 'pdf_export_download',
}
export type JwtPayload = {
  sub: string;
  email: string;
  workspaceId: string;
  type: 'access';
  sessionId?: string;
  /**
   * Platform-mode claims. Identity and intent only — never authority.
   *
   * In platform mode the guard discards whatever this token says about the workspace and the role
   * and asks ConqrAccess on every request; these three say *who* and *which tenant was requested*
   * so that it has something to ask about.
   *
   * **Not yet minted.** The login half of the integration — resolving the canonical person through
   * ConqrIdentity and letting ConqrAccess choose the tenant before the session is signed — is not
   * implemented, so no session currently carries these. Until it is, enabling
   * CONQR_PLATFORM_MODE=platform refuses every request, which is the correct direction to fail.
   */
  personUrn?: string;
  conqrTenantId?: string;
};

export type JwtCollabPayload = {
  sub: string;
  workspaceId: string;
  type: 'collab';
};

export type JwtExchangePayload = {
  sub: string;
  workspaceId: string;
  type: 'exchange';
};

export type JwtAttachmentPayload = {
  attachmentId: string;
  pageId: string;
  workspaceId: string;
  type: 'attachment';
};

export interface JwtMfaTokenPayload {
  sub: string;
  workspaceId: string;
  type: 'mfa_token';
}

export type JwtApiKeyPayload = {
  sub: string;
  workspaceId: string;
  apiKeyId: string;
  type: 'api_key';
  /**
   * OAuth-issued MCP access tokens carry an audience (the canonical MCP
   * resource URL) and the granted scope. Manual API keys omit both. The MCP
   * auth guard enforces `aud` when present (confused-deputy defense).
   */
  aud?: string;
  scope?: string;
};

export type JwtPdfRenderPayload = {
  pageId: string;
  workspaceId: string;
  type: 'pdf_render';
};

export type JwtPdfExportDownloadPayload = {
  fileTaskId: string;
  workspaceId: string;
  type: 'pdf_export_download';
};
