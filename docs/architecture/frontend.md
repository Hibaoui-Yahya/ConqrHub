# Frontend Architecture

A React 18 SPA built with Vite, organized by feature, with EE code isolated behind feature flags.

## Stack

- **React 18** + **TypeScript**
- **Vite** — dev server (`:5173`) and production bundler
- **Mantine** — UI primitives, modals, forms
- **React Router v7** — routing, layouts, loaders
- **Jotai** — global / UI state (atoms)
- **TanStack Query** — server state, caching, background refetch
- **Tiptap (ProseMirror)** — editor
- **Yjs** + **@hocuspocus/provider** — real-time
- **Socket.io client** — non-document real-time
- **Axios** — HTTP client (`lib/api-client.ts`); proxies through Vite to `/api`
- **react-i18next** — translations

## Top-level layout

```
apps/client/src/
├── main.tsx                Entry — React + Mantine + Router
├── App.tsx                 Route table
├── lib/
│   └── api-client.ts       Axios wrapper (base /api, redirect on 401)
├── features/               Domain features (kebab-case folders)
│   ├── attachments/
│   ├── auth/
│   ├── comment/
│   ├── editor/
│   ├── favorite/
│   ├── file-task/
│   ├── group/
│   ├── home/
│   ├── notification/
│   ├── page/
│   ├── page-history/
│   ├── search/
│   ├── session/
│   ├── share/
│   ├── space/
│   ├── user/
│   ├── websocket/
│   └── workspace/
├── ee/                     Enterprise-only feature folders
│   ├── ai/                 Generative AI (Ask AI)
│   ├── ai-chat/            Multi-turn AI chat
│   ├── api-key/            API key management UI
│   ├── audit/              Audit log viewer
│   ├── billing/            Stripe billing UI
│   ├── cloud/              Cloud-only screens
│   ├── comment/            Comment resolution
│   ├── components/         EE-only shared UI
│   ├── entitlement/        entitlementAtom + provider
│   ├── hooks/              useHasFeature, etc.
│   ├── licence/            License activation UI
│   ├── mfa/                MFA setup + verification
│   ├── page-permission/    Page-level permission UI
│   ├── pages/              EE page-related screens
│   ├── page-verification/  Page verification UI
│   ├── pdf-export/         PDF export trigger
│   ├── security/           Security & SSO settings
│   ├── template/           Templates UI
│   └── features.ts         The Feature.* mirror
├── components/             Cross-feature shared components
├── hooks/                  Cross-feature hooks
├── routes/                 Route definitions, layouts, guards
├── translations/           i18n strings
└── theme/                  Mantine theme overrides
```

## Path alias

`@/*` → `./src/*` (configured in `tsconfig.json` and `vite.config.ts`).

## Feature-folder convention

Each `features/<name>/` is self-contained:

```
features/page/
├── atoms/             Jotai atoms for this feature
├── hooks/             useXxx hooks (often wrap TanStack Query)
├── queries/           TanStack Query setup, key factories
├── services/          API calls that aren't TanStack-native
├── types/             TypeScript types
└── components/        UI specific to this feature
```

Cross-feature components live in `components/`. Cross-feature hooks in `hooks/`.

## Routing

`App.tsx` declares the route table. Key route patterns:

| Route | Purpose |
|---|---|
| `/login`, `/signup`, `/forgot-password` | Auth |
| `/` | Home redirect (last-visited workspace) |
| `/s/:spaceSlug` | Space landing |
| `/s/:spaceSlug/p/:pageSlug` | Page editor / viewer |
| `/share/:shareId/p/:pageSlug` | Public-share page viewer |
| `/settings/*` | All settings (account, workspace, system) |

Authenticated routes are wrapped in a layout that renders the sidebar, top bar, and notification system.

## State

| State kind | Tool | Examples |
|---|---|---|
| Server data | TanStack Query | Pages, spaces, comments, search results, audit logs |
| Global UI | Jotai atoms | Sidebar collapse, theme, modal state, current user |
| Local UI | `useState` / `useReducer` | Form-local state, inputs |
| Persistent client state | `atomWithStorage` (Jotai) | Entitlements, last-visited workspace, preferences |

The `entitlementAtom` (`ee/entitlement/entitlement-atom.ts`) is the **canonical source** for what features a workspace has. It's hydrated from `POST /workspace/entitlements` and read by every `useHasFeature(...)` call.

## EE module boundary

```
useHasFeature('ai')
       │
       ▼
entitlementAtom  ──── stores  { tier, features: ['ai', 'mfa', ...] }
       ▲
       └─ hydrated by  POST /workspace/entitlements
```

UI components do not import from `ee/*` directly into `features/*`. Instead, the routing layer chooses to render an EE component or a "feature locked" fallback based on `useHasFeature`. This means:

- A free-tier build can render the whole client without the EE folder if you tree-shake aggressively (the imports are dynamic at the route layer).
- The `Settings > AI` page renders `<AISettings />` from `ee/ai/` when the flag is present, and a paid-feature placeholder otherwise.

## API client

`lib/api-client.ts` is a thin Axios wrapper:

- Base URL `/api`
- Sends cookies (`withCredentials: true`)
- Auto-redirects to `/login` on 401
- Used by all TanStack Query queries and mutations

Vite dev server proxies `/api`, `/socket.io`, and `/collab` to the backend (`vite.config.ts`).

## Editor integration

The editor lives in `features/editor/`. It composes Tiptap with the extensions exported from `packages/editor-ext/` plus the Hocuspocus collaboration provider. See [`./editor.md`](./editor.md).

## Internationalization

`translations/` contains JSON locale files. The default is English. Locale negotiation uses Crowdin (`crowdin.yml`).

## Build

`pnpm client:build` produces a static bundle that the API server serves in production via the `static` integration. Bundles are split per route (React Router lazy loading) and EE code is in its own chunks.

## What lives where — quick lookup

| Need | Look in |
|---|---|
| A new page-tree feature | `features/page/` |
| A workspace setting screen | `features/workspace/` |
| An EE-only setting | `ee/security/` or `ee/<feature>/` |
| A new Tiptap node | `packages/editor-ext/src/lib/<name>/` then wire in `features/editor/` |
| A new modal pattern | `components/modal/` |
| A new feature flag check | `useHasFeature('your:flag')` |

For the formal feature-flag list and entitlement contract, see [`./feature-gating.md`](./feature-gating.md).
