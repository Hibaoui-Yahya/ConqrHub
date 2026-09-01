# ConqrPlan → ConqrHub UI parity (visual pass)

**Date:** 2026-09-01
**Status:** Approved (design approved in chat by Yahya)
**Scope tier:** Visual parity pass — restyle existing surfaces only; no new interaction paradigms, no API/DB changes.

## Goal

Make ConqrHub's content surfaces look and feel like ConqrPlan (our Plane fork), so the suite reads as one product. The foundation is already shared — Plane's OKLCH token system is ported to `packages/tokens/tokens.css`, Inter Variable is the font, `apps/client/src/theme.ts` bridges Mantine v8 onto those tokens, and the app shell is already the Plane-style rounded workspace card with a shared dark-mode cookie. What still looks like stock Docmost/Mantine is everything inside the content card.

## Approach

Restyle in place: keep Mantine components, style them with the already-ported Plane tokens via colocated CSS modules — the same idiom used when the app shell was Plane-ified. No Tailwind, no porting of Plane's `propel`/`ui` packages, no new dependencies.

ConqrPlan reference vocabulary (from `ConqrPlane/packages/tailwind-config/variables.css` and `issue-layouts/`):

- Dense 13px body type; 11px uppercase tertiary section labels.
- Hairline `0.5px` borders (`--border-strong`) on metadata pills; `h-5` (20px) pill geometry.
- Row hover `--bg-layer-transparent-hover`, active `--bg-layer-transparent-active`.
- Layered surfaces (`--bg-surface-1/2`, `--bg-layer-1`) instead of heavy dividers.
- Nav items as pill rows: `rounded-md`, `px-2 py-1`.

## Sections (in build order)

### 1. Shared page list rows

Replace the borderless Mantine `Table` pattern in `apps/client/src/components/common/recent-changes.tsx`, `features/home/components/favorites-pages.tsx`, and `features/home/components/created-by-me.tsx` with one shared `PageListRow` component (new, under `components/common/`):

- ~44px full-bleed rows, hover `--bg-layer-transparent-hover`, hairline divider between rows.
- Left: page emoji/icon + truncated title (13px, `--txt-primary`, weight 500).
- Right-aligned metadata strip in Plane pill geometry (20px height, 0.5px `--border-strong`, `rounded-sm`, 10.5px horizontal padding): space chip, contributor avatar (16px), relative timestamp in `--txt-tertiary`.
- "Load more" keeps `Button variant="subtle"`.

All three list surfaces (home tabs, space home tabs, favorites page) consume it. Keyboard/-link behavior unchanged.

### 2. Space cards

`features/space/components/space-carousel.tsx` + `space-grid.tsx` (+ their CSS modules) adopt Plane's project-card anatomy (`ConqrPlane/apps/web/core/components/project/card.tsx`):

- ~96px banner: deterministic gradient generated from the space's initials color (`lib/get-initials-color.ts`), with a subtle bottom scrim. No image uploads — Plane's own default-cover fallback pattern.
- 36px translucent logo tile (`--alpha-white` tint) holding the space avatar/initials, overlapping the banner-body seam.
- Space name in on-color text over the banner; body with one description line, stacked member `AvatarGroup`, page count.
- Hover-revealed kebab actions; whole card clickable as today.

### 3. All-spaces table

`features/space/components/spaces-page/all-spaces-list.tsx`: keep the `Table` structure, restyle to Plane's list idiom — 11px uppercase `--txt-tertiary` header row, 44px body rows, hairline dividers, no zebra, toolbar row (search + new-space action) aligned to Plane's `Header.LeftItem/RightItem` composition.

### 4. Tabs

`features/home/components/home-tabs.tsx` and `features/space/components/space-home-tabs.tsx`: one shared tab style (extend the `Tabs` theme override in `theme.ts` or a shared module) matching Plane's compact tab chrome — 13px labels, tighter underline, `--txt-secondary` idle / `--txt-primary` active.

### 5. Sidebar + page tree

`components/layouts/global/global-sidebar.module.css`, `features/space/components/sidebar/space-sidebar.module.css`, `features/page/tree/styles/tree.module.css`: Plane pill nav rows — `rounded-md`, `px-2 py-1`, active `--bg-layer-transparent-active` + `--txt-primary`, idle `--txt-secondary` with hover `--bg-layer-transparent-hover`. Tree rows get matching height and indent treatment; chevron/emoji/menu affordances unchanged.

### 6. Search spotlight

`features/search/components/search-spotlight.tsx`, `search-result-item.tsx`, `search-control.tsx`: dense result rows using the same row + pill metadata language, modal surface using the `overlay-200` shadow token — Plane power-K look. Behavior (actions, filters, attachment download) unchanged.

### 7. Empty states + skeletons

Restyle `components/ui/empty-state.tsx` and `no-table-results.tsx` to the suite-native `CenteredState` anatomy proven in ConqrPlan's docs area (`project-docs-root.tsx`): 48px brand-tinted rounded tile with icon, title, description, optional CTA. `page-list-skeleton.tsx` becomes pulse bars (`--bg-layer-1`). We do NOT port Plane's ~25 SVG illustration registry.

## Out of scope (future work, explicitly deferred)

- Real cover-image uploads for pages/spaces. Note: `pages.cover_photo` exists in the DB and repos but nothing sets it; there is no cover `AttachmentType`. Requires backend work (attachment type, endpoint, DTO) — deep-adoption tier.
- Layout switcher (list/grid/table), filters/display-options toolbar, side-peek page preview.
- Any change to routes, data fetching, or server code.

## Error handling

No new failure modes — all changes are presentational. Existing loading/error/empty branches in each surface keep their logic, only their appearance changes (section 7 styles the shared empty/loading components they render).

## Testing & verification

- `pnpm --filter client exec tsc --noEmit` (or the client build) + client lint must pass.
- Visual verification on the local dev server with the headless browser: per-section before/after screenshots in both light and dark mode, compared side-by-side against ConqrPlan's equivalents.
- No unit-test changes expected (styling-only); any snapshot tests that break get updated with the reviewed visuals.

## Delivery

One branch (`feat/plane-ui-parity`), one commit per section in the order above, so each surface is independently revertable and reviewable by screenshot.
