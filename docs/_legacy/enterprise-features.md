# ConqrAI Wiki - Enterprise Features Documentation

Complete technical documentation of all paid/enterprise features, covering functionality, architecture, API endpoints, data models, and implementation details.

---

## Table of Contents

1. [Feature Gating System](#1-feature-gating-system)
2. [Pricing Tiers & Feature Matrix](#2-pricing-tiers--feature-matrix)
3. [Core Features (Free)](#3-core-features-free)
4. [AI Features](#4-ai-features)
5. [Search](#5-search)
6. [Access & Permissions](#6-access--permissions)
7. [Security & Authentication](#7-security--authentication)
8. [Import & Export](#8-import--export)
9. [Admin & Compliance](#9-admin--compliance)
10. [Content & Collaboration](#10-content--collaboration)
11. [License & Billing](#11-license--billing)
12. [Database Schema](#12-database-schema)
13. [Queue & Background Jobs](#13-queue--background-jobs)
14. [API Reference](#14-api-reference)

---

## 1. Feature Gating System

### How Features Are Locked

Every enterprise feature is identified by a string constant in `apps/server/src/common/features.ts` and `apps/client/src/ee/features.ts`:

```typescript
export const Feature = {
  SSO_CUSTOM:          'sso:custom',
  SSO_GOOGLE:          'sso:google',
  MFA:                 'mfa',
  API_KEYS:            'api:keys',
  COMMENT_RESOLUTION:  'comment:resolution',
  PAGE_PERMISSIONS:    'page:permissions',
  AI:                  'ai',
  CONFLUENCE_IMPORT:   'import:confluence',
  DOCX_IMPORT:         'import:docx',
  ATTACHMENT_INDEXING:  'attachment:indexing',
  SECURITY_SETTINGS:   'security:settings',
  MCP:                 'mcp',
  SCIM:                'scim',
  PAGE_VERIFICATION:   'page:verification',
  AUDIT_LOGS:          'audit:logs',
  RETENTION:           'retention',
  SHARING_CONTROLS:    'sharing:controls',
  VIEWER_COMMENTS:     'comment:viewer',
  TEMPLATES:           'templates',
  PDF_EXPORT:          'export:pdf',
};
```

### Server-Side Gating

**File:** `apps/server/src/integrations/environment/license-check.service.ts`

```
LicenseCheckService
  isValidEELicense()      - Validates license key format/signature
  hasFeature(feature)     - Checks if license includes a feature
  getFeatures()           - Returns all features in the license
  resolveFeatures()       - Cloud: plan-based lookup; Self-hosted: license key
  resolveTier()           - Returns tier: free | standard | business | enterprise
```

- **Cloud mode:** Uses plan-based feature registry (bypasses license keys)
- **Self-hosted:** Loads EE module (`/ee/licence/license.service`) dynamically via `ModuleRef`
- Falls back to free tier if EE module unavailable

Features are checked in controllers/services before executing gated logic:
```typescript
const hasFeature = await this.licenseCheckService.hasFeature(
  workspace.licenseKey,
  Feature.SECURITY_SETTINGS,
);
if (!hasFeature) throw new ForbiddenException();
```

### Client-Side Gating

**Entitlement atom** (Jotai):
```typescript
// apps/client/src/ee/entitlement/entitlement-atom.ts
export const entitlementAtom = atomWithStorage<Entitlements | null>("entitlements", null);

type Entitlements = {
  cloud: boolean;
  tier: "free" | "standard" | "business" | "enterprise";
  features: string[];
};
```

**Feature check hook:**
```typescript
// apps/client/src/ee/hooks/use-feature.ts
export const useHasFeature = (feature: string): boolean => {
  const [entitlements] = useAtom(entitlementAtom);
  return entitlements?.features?.includes(feature) ?? false;
};
```

**Upgrade label** shown when a feature is locked:
- Cloud: `"Upgrade your plan"`
- Self-hosted (free): `"Available with a paid license"`
- Self-hosted (paid, missing feature): `"Upgrade your license tier."`

**API:** `POST /workspace/entitlements` returns the tier + features array.

---

## 2. Pricing Tiers & Feature Matrix

Based on the official pricing page:

| Feature | Community (Free) | Business ($3.5/user/mo) | Enterprise (Custom) |
|---------|:---:|:---:|:---:|
| **Core** | | | |
| Pages, editor, rich content blocks | Y | Y | Y |
| Realtime collaboration | Y | Y | Y |
| Spaces | Y | Unlimited | Unlimited |
| Groups | Y | Y | Y |
| Page history and restore | Y | Y | Y |
| Comments | Y | Y | Y |
| Resolve comments | - | Y | Y |
| Diagrams (Draw.io, Excalidraw, Mermaid) | Y | Y | Y |
| Public sharing | - | Y | Y |
| Disable public sharing (workspace/space) | - | Y | Y |
| Remove branding in public pages | - | Y | Y |
| API keys & management | - | Y | Y |
| Page verification/review workflow | - | - | Y |
| Version history | - | Y | Y |
| Templates | - | Y | Y |
| **Search** | | | |
| Full-text search | Y | Y | Y |
| Typesense search driver | - | Y | Y |
| Full-text search in attachments (PDF, DOCX) | - | Y | Y |
| **AI** | | | |
| AI Search (AI Answers) | - | - | Y |
| AI Assistant (Translate, edit, generate) | - | - | Y |
| MCP support | - | - | Y |
| **Access & Permissions** | | | |
| Spaces and permissions | Y | Y | Y |
| Page-level granular permissions | - | - | Y |
| SSO (SAML 2.0, OIDC, LDAP) | - | Y | Y |
| Multi-factor authentication (MFA) | - | Y | Y |
| SCIM provisioning | - | - | Y |
| **Import & Export** | | | |
| Import (Markdown, HTML) | Y | Y | Y |
| Import (Notion) | - | Y | Y |
| Import (Confluence) | - | Y | Y |
| Import (DOCX) | - | Y | Y |
| Export (Markdown, HTML) | Y | Y | Y |
| Export (PDF) | - | Y | Y |
| **Security & Compliance** | | | |
| Self-hosted / on-premises | Y | Y | Y |
| Air-gapped deployment | - | Y | Y |
| Audit logs | - | - | Y |
| Security controls | - | Partial | Y |
| Retention controls | - | - | Y |
| **Support** | | | |
| Community support | Y | Y | Y |
| Email support | - | Y | Y |
| Priority support | - | - | Y |

---

## 3. Core Features (Free)

These features are available in the Community (free) tier:

- **Pages & Editor:** Rich text editor (Tiptap/ProseMirror), block-based content, slash commands
- **Realtime Collaboration:** Yjs CRDT via Hocuspocus, cursor presence, conflict-free editing
- **Spaces:** Workspace-level content organization
- **Groups:** User grouping for bulk permission management
- **Page History:** Version tracking with restore capability
- **Comments:** Inline and page-level comments
- **Diagrams:** Draw.io, Excalidraw, Mermaid support
- **Full-text Search:** PostgreSQL-based tsquery search
- **Basic Import/Export:** Markdown and HTML
- **Self-hosted Deployment:** Full Docker/docker-compose support

---

## 4. AI Features

### 4.1 Generative AI (Ask AI)

**Feature flag:** `Feature.AI`
**Tier:** Enterprise
**Files:**
- Server: `apps/server/src/ee/` (dynamically loaded)
- Client: `apps/client/src/ee/ai/`

**Functionality:**
The AI Assistant provides in-editor AI capabilities for content creation and editing. Users can select text and invoke AI actions via a context menu.

**Available Actions:**
| Action | Description |
|--------|-------------|
| `IMPROVE_WRITING` | Rewrite selected text for clarity and flow |
| `FIX_SPELLING_GRAMMAR` | Correct spelling and grammar errors |
| `MAKE_SHORTER` | Condense selected text |
| `MAKE_LONGER` | Expand selected text with more detail |
| `SIMPLIFY` | Rewrite in simpler language |
| `CHANGE_TONE` | Adjust the tone (formal, casual, etc.) |
| `SUMMARIZE` | Create a summary of selected text |
| `EXPLAIN` | Generate an explanation |
| `CONTINUE_WRITING` | Continue writing from the cursor position |
| `TRANSLATE` | Translate to a specified language |
| `CUSTOM` | Free-form prompt with selected text as context |

**API Endpoints:**
```
POST /api/ai/generate         - One-shot generation
POST /api/ai/generate/stream  - Streaming generation (SSE)
```

**Request:**
```typescript
interface AiGenerateDto {
  action?: AiAction;
  content: string;      // Selected text or page content
  prompt?: string;      // Custom prompt (for CUSTOM action)
}
```

**Workspace Settings:**
```json
{ "ai": { "generative": true } }
```

**How to enable:** Settings > AI > Toggle "Generative AI (Ask AI)"

**Supported Providers:** OpenAI, Google Gemini, Ollama, OpenAI-compatible endpoints (configured via Vercel AI SDK)

---

### 4.2 AI Search (AI Answers)

**Feature flag:** `Feature.AI`
**Tier:** Enterprise
**Files:** `apps/client/src/ee/ai/components/enable-ai-search.tsx`

**Functionality:**
Semantic search using vector embeddings. When a user searches, AI generates a natural-language answer with source citations from workspace pages.

**API Endpoint:**
```
POST /api/ai/answers  - Streaming search response (SSE)
```

**Response (streamed):**
```typescript
interface IAiSearchResponse {
  answer: string;
  sources?: Array<{
    pageId: string;
    title: string;
    slugId: string;
    spaceSlug: string;
    similarity: number;
    distance: number;
    chunkIndex: number;
    excerpt: string;
  }>;
}
```

**Workspace Settings:**
```json
{ "ai": { "search": true } }
```

**Dependencies:**
- Vector embeddings indexed in database
- Requires AI provider configuration
- Self-hosted only setting (not available on cloud toggle)

---

### 4.3 AI Chat (Multi-turn Conversations)

**Feature flag:** `Feature.AI`
**Tier:** Enterprise
**Files:** `apps/client/src/ee/ai-chat/`

**Functionality:**
Full multi-turn chat interface where users can have conversations about their workspace content. Supports page mentions, file attachments, and tool calling.

**API Endpoints:**
```
POST /ai/chats/create   - Create new chat
POST /ai/chats          - List chats (paginated)
POST /ai/chats/info     - Get chat + messages
POST /ai/chats/delete   - Delete chat
POST /ai/chats/update   - Update title
POST /ai/chats/search   - Search chats
POST /api/ai/chats/send - Stream chat response (SSE)
POST /ai/chats/upload   - Upload file to chat
```

**Data Models:**
```typescript
type AiChat = {
  id: string;
  workspaceId: string;
  creatorId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

type AiChatMessage = {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: any;
  metadata?: any;
  createdAt: string;
};
```

**Stream Events:**
```typescript
type AiChatStreamEvent =
  | { type: 'chat_created'; chatId: string }
  | { type: 'content'; text: string }
  | { type: 'tool_call'; id: string; name: string; args: any }
  | { type: 'tool_result'; id: string; result: any }
  | { type: 'done'; messageId: string; usage?: any }
  | { type: 'error'; message: string; code?: string; retryable?: boolean };
```

**Available AI Tools (via tool calling):**
| Tool | Description |
|------|-------------|
| `search_pages` | Search workspace pages |
| `get_page` | Get page content by ID |
| `create_page` | Create a new page |
| `update_page` | Update page content |
| `list_pages` | List pages in space |
| `list_child_pages` | List child pages |
| `duplicate_page` | Duplicate a page |
| `copy_page_to_space` | Copy page to another space |
| `move_page` | Move page within space |
| `move_page_to_space` | Move to different space |
| `get_space` | Get space details |
| `list_spaces` | List all spaces |
| `create_space` | Create new space |
| `update_space` | Update space |
| `get_comments` | Get page comments |
| `create_comment` | Add comment |
| `update_comment` | Edit comment |
| `search_attachments` | Search file attachments |
| `list_workspace_members` | List members |
| `get_current_user` | Get current user info |

**Features:**
- `@mention` syntax to inject page content into chat context
- File attachments via upload
- Chat history with cursor pagination
- Sidebar panel mode (when on a page) or full-page mode
- Streaming responses via SSE with AbortController cancellation

**Workspace Settings:**
```json
{ "ai": { "chat": true } }
```

---

### 4.4 MCP (Model Context Protocol)

**Feature flag:** `Feature.MCP`
**Tier:** Enterprise
**Files:** `apps/client/src/ee/ai/components/mcp-settings.tsx`

**Functionality:**
Exposes an MCP server endpoint that external AI tools (Claude Desktop, etc.) can connect to for reading and writing workspace content.

**Endpoint:** `GET/POST /mcp` (MCP protocol)

**Supported MCP Tools:** Same as AI Chat tool list (20 tools)

**How to enable:** Settings > AI > Toggle "Model Context Protocol (MCP)"

**Authentication:** Requires an API key (from the API Keys feature)

**Workspace Settings:**
```json
{ "ai": { "mcp": true } }
```

---

## 5. Search

### 5.1 Full-Text Search (Free)

**Files:** `apps/server/src/core/search/`

Built-in PostgreSQL-based full-text search using `tsvector` and `tsquery`.

**API Endpoints:**
```
POST /search             - Full-text search
POST /search/suggestions - Type-ahead suggestions (users, groups, pages)
```

**Features:**
- Unaccent support (ignore diacritics)
- Rank-based result ordering
- Search highlighting with context snippets
- Scope: by space, by user's accessible spaces, or by share context
- Permission-aware filtering

### 5.2 Typesense Search Driver (Business+)

External Typesense integration for faster, more advanced search with typo tolerance, faceting, and vector search capabilities.

### 5.3 Attachment Indexing (Business+)

**Feature flag:** `Feature.ATTACHMENT_INDEXING`

Indexes content of PDF and DOCX attachments for full-text search. Allows searching within uploaded documents, not just page content.

---

## 6. Access & Permissions

### 6.1 Space Permissions (Free)

Built-in role-based access at the space level:
- **Admin:** Manage space settings, members, and delete space
- **Writer:** Read and write pages
- **Reader:** Read-only access

### 6.2 Page-Level Granular Permissions (Enterprise)

**Feature flag:** `Feature.PAGE_PERMISSIONS`
**Files:**
- Client: `apps/client/src/ee/page-permission/`
- Server: Database tables `page_access`, `page_permissions`

**Functionality:**
Fine-grained per-page access control that overrides space-level permissions. Allows restricting individual pages to specific users or groups.

**Permission Model:**
```
Space-Level Permission (default for all pages)
  -> Page-Level Restriction (override on specific pages)
    -> Per-User/Group Permission (reader or writer)
      -> Inheritance: Child pages inherit parent restrictions
```

**Roles:**
| Role | Can View | Can Edit | Can Manage |
|------|:---:|:---:|:---:|
| Reader | Y | - | - |
| Writer | Y | Y | - |
| Space Admin | Y | Y | Y |

**API Endpoints:**
```
POST /pages/{pageId}/restrict              - Enable restriction
POST /pages/{pageId}/unrestrict            - Remove restriction
POST /pages/{pageId}/permissions           - List permissions (paginated)
POST /pages/{pageId}/permissions/add       - Add user/group permission
POST /pages/{pageId}/permissions/remove    - Remove permission
POST /pages/{pageId}/permissions/update-role - Change role
POST /pages/{pageId}/restrictions/info     - Get restriction details
```

**Restriction Info Response:**
```typescript
interface IPageRestrictionInfo {
  restrictionId?: string;
  hasDirectRestriction: boolean;
  hasInheritedRestriction: boolean;
  inheritedFrom?: { id: string; slugId: string; title: string };
  userAccess: { canView: boolean; canEdit: boolean; canManage: boolean };
}
```

**Access Validation (server-side):**
```typescript
PageAccessService.validateCanView(page, user)
PageAccessService.validateCanEdit(page, user)
PageAccessService.validateCanComment(page, user)
```

**Audit Events:** `PAGE_RESTRICTED`, `PAGE_RESTRICTION_REMOVED`, `PAGE_PERMISSION_ADDED`, `PAGE_PERMISSION_REMOVED`

---

### 6.3 SSO (SAML 2.0, OIDC, LDAP) (Business+)

**Feature flag:** `Feature.SSO_CUSTOM`, `Feature.SSO_GOOGLE`
**Files:** `apps/client/src/ee/security/`

**Supported Providers:**

| Provider | Type | Configuration |
|----------|------|---------------|
| Google | OAuth 2.0 | Client ID, Client Secret |
| SAML | SAML 2.0 | SSO URL, Certificate |
| OIDC | OpenID Connect | Issuer URL, Client ID, Client Secret |
| LDAP | LDAP/AD | URL, Bind DN, Bind Password, Base DN, User Search Filter |

**API Endpoints:**
```
POST /sso/providers  - List providers
POST /sso/info       - Get provider details
POST /sso/create     - Create provider
POST /sso/update     - Update provider
POST /sso/delete     - Delete provider
```

**Provider Data Model:**
```typescript
interface IAuthProvider {
  id: string;
  name: string;
  type: 'google' | 'saml' | 'oidc' | 'ldap';
  // SAML
  samlUrl?: string;
  samlCertificate?: string;
  // OIDC
  oidcIssuer?: string;
  oidcClientId?: string;
  oidcClientSecret?: string;
  // LDAP
  ldapUrl?: string;
  ldapBindDn?: string;
  ldapBindPassword?: string;
  ldapBaseDn?: string;
  ldapUserSearchFilter?: string;
  ldapUserAttributes?: object;
  ldapTlsEnabled?: boolean;
  ldapTlsCaCert?: string;
  // Common
  allowSignup: boolean;
  isEnabled: boolean;
  groupSync: boolean;
  providerId: string;
}
```

**SSO Enforcement:**
- `workspace.enforceSso = true` prevents password-based login
- Users must authenticate via configured SSO provider
- How to enable: Settings > Security > Toggle "Enforce SSO"

**Audit Events:** `SSO_PROVIDER_CREATED`, `SSO_PROVIDER_UPDATED`, `SSO_PROVIDER_DELETED`

---

### 6.4 Multi-Factor Authentication (Business+)

**Feature flag:** `Feature.MFA`
**Files:** `apps/client/src/ee/mfa/`

**Functionality:**
Time-based One-Time Password (TOTP) 2FA with backup codes. Can be enforced workspace-wide.

**User Flow:**
1. User goes to Settings > Account > Security
2. Clicks "Enable 2FA"
3. Scans QR code with authenticator app (Google Authenticator, Authy, etc.)
4. Enters verification code to confirm
5. Receives backup codes (one-time use)
6. On next login, prompted for TOTP code after password

**API Endpoints:**
```
POST /mfa/status                - Get user MFA status
POST /mfa/setup                 - Start setup (returns QR code + secret)
POST /mfa/enable                - Verify code and enable
POST /mfa/disable               - Disable MFA
POST /mfa/generate-backup-codes - Generate new backup codes
POST /mfa/verify                - Verify 2FA code during login
POST /mfa/validate-access       - Check if user needs MFA
```

**MFA Status Response:**
```typescript
interface MfaStatusResponse {
  isEnabled?: boolean;
  method?: 'totp' | 'email' | null;
  backupCodesCount?: number;
}
```

**Workspace Enforcement:**
- `workspace.enforceMfa = true` forces all users to set up MFA
- Users see a setup-required page until MFA is configured
- How to enable: Settings > Security > Toggle "Enforce MFA"

**Audit Events:** `USER_MFA_ENABLED`, `USER_MFA_DISABLED`, `USER_MFA_BACKUP_CODE_GENERATED`

---

### 6.5 SCIM Provisioning (Enterprise)

**Feature flag:** `Feature.SCIM`

**Functionality:**
System for Cross-domain Identity Management (SCIM 2.0). Automates user and group provisioning from identity providers (Okta, Azure AD, etc.).

**Capabilities:**
- Automatic user creation/deactivation based on IdP changes
- Group membership sync
- Attribute mapping (name, email, etc.)

---

## 7. Security & Authentication

### 7.1 Sharing Controls (Business+)

**Feature flag:** `Feature.SHARING_CONTROLS`
**Files:** `apps/client/src/ee/security/components/disable-public-sharing.tsx`

**Functionality:**
- **Workspace-level:** Disable all public sharing across the workspace
- **Space-level:** Disable public sharing per space
- Confirmation dialog warns that existing shared links will be deleted

**Workspace Settings:**
```json
{ "sharing": { "disabled": true } }
```

### 7.2 Viewer Comments (Business+)

**Feature flag:** `Feature.VIEWER_COMMENTS`
**Files:** `apps/client/src/ee/security/components/space-viewer-comments-toggle.tsx`

**Functionality:**
Allow users with read-only (viewer) access to add comments on pages. Configured per space.

### 7.3 Remove Branding in Public Pages (Business+)

Removes the "Powered by ConqrAI Wiki" branding from publicly shared pages.

### 7.4 Allowed Domains

Restrict user signup to specific email domains. Available for cloud or custom SSO configurations.

### 7.5 Air-Gapped Deployment (Business+)

Self-hosted deployment without internet access. All features work offline.

---

## 8. Import & Export

### 8.1 Import (Markdown, HTML) - Free

**Files:** `apps/server/src/integrations/import/`

**API Endpoints:**
```
POST /pages/import      - Single file import (MD/HTML)
POST /pages/import-zip  - Bulk import from ZIP
```

**Pipeline:** File -> Conversion (MD/HTML -> ProseMirror JSON) -> Page creation

### 8.2 Import (Notion) - Business+

Import from Notion ZIP exports. Parses Notion's internal format and converts to pages.

### 8.3 Import (Confluence) - Business+

**Feature flag:** `Feature.CONFLUENCE_IMPORT`

Import from Confluence space exports (ZIP format). Handles:
- Page hierarchy reconstruction
- Attachment migration
- Content format conversion

### 8.4 Import (DOCX) - Business+

**Feature flag:** `Feature.DOCX_IMPORT`

Import Microsoft Word documents. Uses `mammoth` library for DOCX -> HTML -> ProseMirror JSON conversion.

**Processing:**
- Lazy-loads EE module for DOCX handling
- Size limit: 20MB per file
- Preserves formatting, headings, lists, tables

### 8.5 Export (Markdown, HTML) - Free

**Files:** `apps/server/src/integrations/export/`

**API Endpoints:**
```
POST /pages/export   - Export single page
POST /spaces/export  - Export entire space
```

**Features:**
- HTML and Markdown format
- ZIP packaging (multiple pages with attachments)
- Permission-aware (respects page-level permissions)
- Attachment inclusion
- Children pages inclusion
- Internal link rewriting

### 8.6 Export (PDF) - Business+

**Feature flag:** `Feature.PDF_EXPORT`
**Files:** `apps/client/src/ee/pdf-export/`

Server-side PDF generation using Gotenberg (external service).

**Queue Jobs:** `PDF_EXPORT_TASK`, `PDF_EXPORT_CLEANUP`

**Requires:** `GOTENBERG_URL` environment variable pointing to a Gotenberg instance.

---

## 9. Admin & Compliance

### 9.1 API Keys (Business+)

**Feature flag:** `Feature.API_KEYS`
**Files:** `apps/client/src/ee/api-key/`

**Functionality:**
Create and manage API keys for programmatic access to the workspace.

**Two Scopes:**
- **User-level:** Personal API keys (Settings > Account > API Keys)
- **Workspace-level:** Admin-managed keys (Settings > API Management)

**API Endpoints:**
```
POST /api-keys          - List keys (paginated)
POST /api-keys/create   - Create key (name, expiresAt optional)
POST /api-keys/update   - Update name
POST /api-keys/revoke   - Revoke key
```

**Data Model:**
```typescript
interface IApiKey {
  id: string;
  name: string;
  token?: string;          // Only returned once on creation
  creatorId: string;
  workspaceId: string;
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
  creator: { id: string; name: string; email: string };
}
```

**Features:**
- Optional expiration dates
- Last-used tracking
- One-time token display on creation
- Admin can restrict API key creation to admins only
- Used for MCP authentication

**Audit Events:** `API_KEY_CREATED`, `API_KEY_UPDATED`, `API_KEY_DELETED`

---

### 9.2 Audit Logs (Enterprise)

**Feature flag:** `Feature.AUDIT_LOGS`
**Files:** `apps/client/src/ee/audit/`

**Functionality:**
Comprehensive audit trail of all workspace activity. Self-hosted only, owner role required.

**API Endpoints:**
```
POST /audit                   - List logs (paginated, filterable)
POST /audit/retention         - Get retention policy
POST /audit/retention/update  - Update retention (days)
```

**Data Model:**
```typescript
interface IAuditLog {
  id: string;
  workspaceId: string;
  actorId?: string;
  actorType: 'user' | 'system' | 'api_key';
  event: string;
  resourceType: string;
  resourceId?: string;
  spaceId?: string;
  changes?: { before?: any; after?: any };
  metadata?: any;
  ipAddress?: string;
  createdAt: string;
  actor?: { id: string; name: string; email: string; avatarUrl?: string };
  resource?: { id: string; name: string; slug?: string; slugId?: string };
}
```

**Tracked Events (22 categories):**

| Category | Events |
|----------|--------|
| **Workspace** | created, updated, invite_created/resent/revoked |
| **User** | created, deleted, login, logout, role_changed, password_changed/reset, updated, deactivated, activated |
| **API Keys** | created, updated, deleted |
| **Space** | created, updated, deleted, member_added/removed/role_changed |
| **Group** | created, updated, deleted, member_added/removed |
| **Comments** | created, deleted, updated, resolved, reopened |
| **Pages** | created, trashed, deleted, restored, moved_to_space, duplicated |
| **Page Permissions** | page_restricted, restriction_removed, permission_added/removed |
| **Page Verification** | created, updated, removed, verified, approval_requested/rejected, marked_obsolete |
| **Shares** | created, deleted |
| **Import/Export** | page_imported, page_exported, space_exported |
| **SSO** | provider_created/updated/deleted |
| **MFA** | enabled, disabled, backup_code_generated |
| **License** | activated, removed |
| **Attachments** | uploaded |

**Filtering:**
- By event type
- By date range (start/end)
- By actor
- By space

**Retention:**
- Configurable in days/months/years
- Auto-cleanup via `AUDIT_CLEANUP` queue job

---

### 9.3 Retention Controls (Enterprise)

**Feature flag:** `Feature.RETENTION`
**Files:** `apps/client/src/ee/security/components/trash-retention.tsx`

**Functionality:**
Configure automatic deletion of trashed pages after a specified period.

**Settings:**
- Period amount (number)
- Period unit: days, months, years
- Auto-deletes pages from trash after configured period

---

### 9.4 Security Controls (Partial in Business, Full in Enterprise)

Centralized security page (Settings > Security) with:
- SSO provider management (Business+)
- MFA enforcement (Business+)
- Allowed email domains (Business+)
- Public sharing controls (Business+)
- Template creation permissions (Business+)
- Trash retention (Enterprise)

---

## 10. Content & Collaboration

### 10.1 Comment Resolution (Business+)

**Feature flag:** `Feature.COMMENT_RESOLUTION`
**Files:** `apps/client/src/ee/comment/`

**Functionality:**
Mark comments as resolved/reopened. Resolved comments are visually de-emphasized.

**How it works:**
- Toggle button in comment bubble (gray circle -> green filled circle)
- Uses TipTap editor command: `setCommentResolved(commentId, isResolved)`
- Updates Yjs document mark attribute: `{ resolved: boolean }`
- Optimistic UI updates with rollback on error

**API Endpoint:**
```
POST /comments/{commentId}/resolve
```

**Notifications:** Sends `COMMENT_RESOLVED_NOTIFICATION` email when resolved

**Audit Events:** `COMMENT_RESOLVED`, `COMMENT_REOPENED`

---

### 10.2 Templates (Business+)

**Feature flag:** `Feature.TEMPLATES`
**Files:** `apps/client/src/ee/template/`

**Functionality:**
Create and manage reusable page templates.

**API Endpoints:**
```
POST /templates              - List templates (paginated, by space)
POST /templates/{id}         - Get template details
POST /templates/create       - Create template
POST /templates/{id}/update  - Update template
POST /templates/{id}/delete  - Delete template
POST /templates/{id}/use     - Create page from template
```

**Data Model:**
```typescript
interface ITemplate {
  id: string;
  title: string;
  description?: string;
  content?: any;           // ProseMirror JSON
  icon?: string;
  spaceId?: string;        // null = workspace-level
  workspaceId: string;
  creatorId: string;
  lastUpdatedById?: string;
  creator?: { id: string; name: string; avatarUrl?: string };
  createdAt: string;
  updatedAt: string;
}
```

**Features:**
- Space-scoped or workspace-wide templates
- Full editor for template content
- Template preview
- Create page from template
- Full-text search on templates (PostgreSQL tsvector)
- Admin can control member template creation

---

### 10.3 Page Verification / Review Workflow (Enterprise)

**Feature flag:** `Feature.PAGE_VERIFICATION`
**Files:** `apps/client/src/ee/page-verification/`

**Functionality:**
Formal page verification and approval workflow. Two modes:

**Mode 1: Expiring Verification**
- Set an expiration period (days/weeks/months/years)
- Pages automatically transition from "verified" to "expiring" to "expired"
- Verifiers are notified before and after expiration
- Re-verification required

**Mode 2: QMS (Quality Management System) Approval**
- Author submits page for approval
- Designated verifiers review and approve/reject
- Rejection includes a comment
- Pages can be marked as obsolete

**Status Flow:**
```
draft -> in_approval -> approved/rejected -> verified -> expiring -> expired
                                                     -> obsolete
```

**API Endpoints:**
```
POST /pages/{pageId}/verification/info             - Get status
POST /pages/{pageId}/verification/setup            - Enable verification
POST /pages/{pageId}/verification/update           - Update settings
POST /pages/{pageId}/verification/remove           - Disable
POST /pages/{pageId}/verification/verify           - Mark verified
POST /pages/{pageId}/verification/submit-approval  - Submit for QMS approval
POST /pages/{pageId}/verification/reject           - Reject (with comment)
POST /pages/{pageId}/verification/mark-obsolete    - Mark obsolete
POST /verification/list                            - List all verifications
```

**Data Models:**
```typescript
type VerificationType = 'expiring' | 'qms';
type ExpirationMode = 'period' | 'fixed' | 'indefinite';
type PeriodUnit = 'day' | 'week' | 'month' | 'year';
type VerificationStatus = 'verified' | 'expiring' | 'expired' | 'draft' |
                          'in_approval' | 'approved' | 'obsolete' | 'none';

interface IPageVerificationInfo {
  id?: string;
  pageId?: string;
  type?: VerificationType;
  mode?: ExpirationMode;
  periodAmount?: number;
  periodUnit?: PeriodUnit;
  status: VerificationStatus;
  verifiedAt?: string;
  verifiedBy?: { id: string; name: string };
  expiresAt?: string;
  requestedAt?: string;
  requestedBy?: { id: string; name: string };
  rejectedAt?: string;
  rejectedBy?: { id: string; name: string };
  rejectionComment?: string;
  verifiers?: Array<{ id: string; userId: string; isPrimary: boolean }>;
  permissions: {
    canVerify: boolean;
    canManage: boolean;
    canSubmitForApproval: boolean;
    canMarkObsolete: boolean;
  };
}
```

**Notifications:**
- `PAGE_VERIFICATION_EXPIRING` - Before expiration
- `PAGE_VERIFICATION_EXPIRED` - After expiration
- `PAGE_VERIFIED` - When verified
- `PAGE_APPROVAL_REQUESTED` - When submitted for approval
- `PAGE_APPROVAL_REJECTED` - When rejected

**Audit Events:** `PAGE_VERIFICATION_CREATED`, `PAGE_VERIFICATION_UPDATED`, `PAGE_VERIFICATION_REMOVED`, `PAGE_VERIFIED`, `PAGE_APPROVAL_REQUESTED`, `PAGE_APPROVAL_REJECTED`, `PAGE_MARKED_OBSOLETE`

---

## 11. License & Billing

### 11.1 License Management (Self-Hosted)

**Files:** `apps/client/src/ee/licence/`

**API Endpoints:**
```
POST /license/info      - Get current license
POST /license/activate  - Activate with key
POST /license/remove    - Remove license
```

**Data Model:**
```typescript
interface ILicenseInfo {
  id: string;
  customerName: string;
  seatCount: number;
  licenseType: 'business' | 'enterprise';
  issuedAt: string;
  expiresAt: string;
  trial: boolean;
}
```

**How to activate:** Settings > License & Edition > "Activate License" > Enter key

### 11.2 Billing (Cloud Only)

**Files:** `apps/client/src/ee/billing/`

**API Endpoints:**
```
POST /billing/info      - Get subscription
POST /billing/plans     - List plans
POST /billing/checkout  - Get Stripe checkout URL
POST /billing/portal    - Get Stripe customer portal URL
```

**Integration:** Stripe for payment processing, subscription management, and invoicing.

---

## 12. Database Schema

### Enterprise-Specific Tables

```sql
-- API Keys
api_keys (
  id UUID PK,
  name VARCHAR,
  creator_id UUID FK -> users,
  workspace_id UUID FK -> workspaces,
  expires_at TIMESTAMP,
  last_used_at TIMESTAMP,
  created_at, updated_at, deleted_at
)

-- Templates
templates (
  id UUID PK,
  title VARCHAR, description TEXT, icon VARCHAR,
  content JSONB,              -- ProseMirror JSON
  ydoc BYTEA,                 -- Yjs collaborative state
  text_content TEXT,
  tsv TSVECTOR,               -- Full-text search index (GIN)
  space_id UUID FK,           -- null = workspace-level
  workspace_id UUID FK,
  creator_id UUID FK, last_updated_by_id UUID FK,
  collaborator_ids UUID[],
  created_at, updated_at, deleted_at
)

-- Page Permissions
page_access (
  id UUID PK,
  page_id UUID FK,
  workspace_id UUID FK,
  ...
)

page_permissions (
  id UUID PK,
  page_id UUID FK,
  user_id UUID FK,
  group_id UUID FK,
  role VARCHAR,               -- 'reader' | 'writer'
  ...
)

-- Page Verifications
page_verifications (
  id UUID PK,
  page_id UUID UNIQUE FK,
  type VARCHAR,               -- 'expiring' | 'qms'
  status VARCHAR,
  mode VARCHAR,               -- 'approval' | 'periodic_review'
  period_amount INT, period_unit VARCHAR,
  verified_at TIMESTAMP, verified_by_id UUID FK,
  expires_at TIMESTAMP,
  requested_at TIMESTAMP, requested_by_id UUID FK,
  rejected_at TIMESTAMP, rejected_by_id UUID FK,
  rejection_comment TEXT,
  data JSONB,
  workspace_id UUID FK, space_id UUID FK,
  created_at, updated_at
)

page_verifiers (
  id UUID PK,
  page_verification_id UUID FK,
  user_id UUID FK,
  is_primary BOOLEAN,
  added_by_id UUID FK,
  created_at
)

-- Workspace Invitations (free feature, included for reference)
workspace_invitations (
  id UUID PK,
  email VARCHAR,
  role VARCHAR,
  token VARCHAR(16),          -- nanoid
  group_ids UUID[],
  invited_by_id UUID FK,
  workspace_id UUID FK,
  UNIQUE(email, workspace_id),
  created_at, updated_at
)
```

---

## 13. Queue & Background Jobs

Enterprise features use BullMQ (Redis-backed) for background processing:

| Queue | Jobs | Purpose |
|-------|------|---------|
| `EMAIL_QUEUE` | Send emails | Email delivery via SMTP/Postmark |
| `FILE_TASK_QUEUE` | `IMPORT_TASK` | Process ZIP imports (Confluence, Notion, bulk) |
| `NOTIFICATION_QUEUE` | Various | Real-time + email notifications |
| `AUDIT_QUEUE` | `AUDIT_LOG`, `AUDIT_CLEANUP` | Persist audit events, enforce retention |
| `AI_QUEUE` | AI operations | AI generation, embedding indexing |
| `SEARCH_QUEUE` | Search indexing | Re-index pages for search |
| `GENERAL_QUEUE` | `PDF_EXPORT_TASK`, `PDF_EXPORT_CLEANUP` | PDF generation via Gotenberg |
| `GENERAL_QUEUE` | `PAGE_VERIFICATION_EXPIRING` | Pre-expiration notification |
| `GENERAL_QUEUE` | `PAGE_VERIFICATION_EXPIRED` | Post-expiration handling |
| `GENERAL_QUEUE` | `VERIFICATION_RECONCILE` | Cleanup/reconciliation |
| `BILLING_QUEUE` | Stripe webhooks | Process billing events (cloud) |

---

## 14. API Reference

### Authentication

All API calls require one of:
- **Cookie:** `authToken` cookie (set after login)
- **Bearer Token:** `Authorization: Bearer <jwt>` header
- **API Key:** `Authorization: Bearer <api-key>` header

### Base URL

All endpoints are prefixed with `/api/`.

### Pagination

Cursor-based pagination:
```typescript
// Request
{ cursor?: string; limit?: number }

// Response
{
  items: T[];
  meta: {
    hasNextPage: boolean;
    hasPrevPage?: boolean;
    nextCursor?: string;
    prevCursor?: string;
  }
}
```

### Streaming (SSE)

AI endpoints use Server-Sent Events:
```
data: {"type":"content","text":"Hello"}
data: {"type":"done","messageId":"..."}
data: [DONE]
```

Client uses `AbortController` for cancellation.

### Workspace Settings Structure

```typescript
workspace.settings = {
  ai: {
    search: boolean,       // AI Search (AI Answers)
    generative: boolean,   // Ask AI in editor
    chat: boolean,         // AI Chat
    mcp: boolean,          // Model Context Protocol
  },
  sharing: {
    disabled: boolean,     // Disable public sharing
  },
};

workspace.enforceMfa: boolean;   // Force 2FA for all users
workspace.enforceSso: boolean;   // Force SSO login
```

---

## Settings Sidebar Structure

```
Account
  Profile
  Preferences
  API Keys                    (Feature.API_KEYS)

Workspace
  General
  Members
  Billing                     (Cloud + Admin only)
  Security & SSO              (Feature.SECURITY_SETTINGS + Admin)
  Groups
  Spaces
  Public Sharing
  Templates                   (Feature.TEMPLATES)
  Verified Pages              (Feature.PAGE_VERIFICATION)
  AI Settings                 (Admin)
  API Management              (Feature.API_KEYS + Admin)
  Audit Log                   (Feature.AUDIT_LOGS + Owner + Self-hosted)

System
  License & Edition           (Self-hosted + Admin)
```

---

*This document was generated from the ConqrAI Wiki codebase (v0.80.0). Features and APIs may change between versions.*
