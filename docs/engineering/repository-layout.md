# Repository layout

A guided tour of the monorepo. After this you should know where to land for any task.

## Top level

```
conqrai-wiki/
├── apps/                  Applications (client, server)
├── packages/              Shared libraries (editor-ext, ee)
├── docs/                  This documentation set
├── docker-compose.yml     Local infra (Postgres, Redis, optional Typesense, Gotenberg)
├── Dockerfile             Production image
├── nx.json                Nx orchestration
├── pnpm-workspace.yaml    pnpm workspace config
├── package.json           Root scripts
├── crowdin.yml            Localization
└── README.md              Project README
```

## `apps/server` — NestJS backend

```
apps/server/
├── src/
│   ├── main.ts                Bootstrap (Fastify, multipart, cookie, websocket adapter)
│   ├── app.module.ts          Root NestJS module
│   ├── app.controller.ts      / app.service.ts
│   ├── common/                Shared: features.ts, decorators, guards, dtos
│   ├── core/                  Domain modules — one folder per business concept
│   │   ├── attachment/  auth/  casl/  comment/  favorite/  group/
│   │   ├── notification/  page/  search/  session/  share/  space/
│   │   ├── user/  watcher/  workspace/
│   │   └── (each module has *.module.ts, *.controller.ts, *.service.ts, dto/)
│   ├── integrations/          Side-channel infra
│   │   ├── audit/  environment/  export/  health/  import/  mail/
│   │   ├── queue/  redis/  security/  static/  storage/  telemetry/
│   │   ├── throttle/  transactional/
│   ├── database/
│   │   ├── migrations/        Timestamped Kysely migrations (43+)
│   │   ├── repos/             Repo classes per table
│   │   └── types/db.d.ts      Auto-generated schema types
│   ├── collaboration/         Hocuspocus / Yjs server
│   ├── ws/                    Socket.io gateway
│   └── ee/                    Empty here — git submodule of private EE
├── package.json
└── tsconfig.json
```

For a domain-by-domain walk, see [`../architecture/backend.md`](../architecture/backend.md).

## `apps/client` — React SPA

```
apps/client/
├── src/
│   ├── main.tsx               Entry — React + Mantine + Router
│   ├── App.tsx                Route table
│   ├── lib/api-client.ts      Axios wrapper
│   ├── features/              Domain feature folders (atoms / hooks / queries / services / types / components)
│   │   ├── attachments/  auth/  comment/  editor/  favorite/  file-task/  group/
│   │   ├── home/  notification/  page/  page-history/  search/  session/
│   │   ├── share/  space/  user/  websocket/  workspace/
│   ├── ee/                    Enterprise feature folders + features.ts mirror
│   │   ├── ai/  ai-chat/  api-key/  audit/  billing/  cloud/  comment/
│   │   ├── components/  entitlement/  hooks/  licence/  mfa/
│   │   ├── page-permission/  pages/  page-verification/  pdf-export/
│   │   ├── security/  template/
│   │   └── features.ts
│   ├── components/            Cross-feature shared UI
│   ├── hooks/                 Cross-feature hooks
│   ├── routes/                Route definitions, layouts, guards
│   ├── translations/          i18n strings
│   └── theme/                 Mantine theme overrides
├── public/                    Static assets
├── vite.config.ts             Dev server + proxy config
├── package.json
└── tsconfig.json
```

For the frontend architecture, see [`../architecture/frontend.md`](../architecture/frontend.md).

## `packages/editor-ext` — Tiptap extensions

```
packages/editor-ext/
├── src/
│   ├── lib/
│   │   ├── attachment/  audio/  callout/  columns/  comment/
│   │   ├── custom-code-block/  details/  drawio/  embed/  excalidraw/
│   │   ├── heading/  highlight/  image/  link/  markdown/  math/
│   │   ├── mention/  pdf/  resizable-node-view/  search-replace/
│   │   ├── shared-storage/  status/  subpages/  table/  unique-id/
│   │   ├── video/
│   ├── index.ts               Re-exports each extension
└── package.json
```

The package is shared between the client editor (`apps/client/src/features/editor/`) and the server-side rendering paths in `apps/server/`. See [`../reference/editor-extensions.md`](../reference/editor-extensions.md).

## `packages/ee`

License stub. Empty folder with `LICENSE`. The actual EE code lives in `apps/server/src/ee/` (submodule) and `apps/client/src/ee/` (in-tree).

## Where to land for common tasks

| Task | Where |
|---|---|
| Add a new page-tree feature | `apps/client/src/features/page/` |
| Add a workspace setting | `apps/server/src/core/workspace/` + `apps/client/src/features/workspace/settings/` |
| Add a new search filter | `apps/server/src/core/search/` |
| Add a new editor block | `packages/editor-ext/src/lib/<name>/` |
| Add an EE-only screen | `apps/client/src/ee/<name>/` |
| Add a new background job | Producer in the relevant service; processor in `apps/server/src/integrations/queue/` or feature module |
| Add a new email | React-email template in `apps/server/src/integrations/transactional/emails/` |
| Add a database migration | `apps/server/src/database/migrations/` (then `pnpm migration:codegen`) |
| Add a feature flag | `apps/server/src/common/features.ts` and `apps/client/src/ee/features.ts` |
| Add a route | `apps/client/src/App.tsx` (or routes/) |

## Path aliases

| Alias | Maps to | Used in |
|---|---|---|
| `@/*` | `apps/client/src/*` | client |
| `@docmost/db/*` | `apps/server/src/database/*` | server |
| `@docmost/transactional/*` | `apps/server/src/integrations/transactional/*` | server |
| `@docmost/ee/*` | `apps/server/src/ee/*` | server (resolves to submodule when present) |

## Naming

- **Folders** kebab-case
- **NestJS files** dot-separated kebab-case (`page.controller.ts`)
- **React components** PascalCase
- **Hooks** `useThing.ts`
- **Atoms** `thingAtom.ts`
