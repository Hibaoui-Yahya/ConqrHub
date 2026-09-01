# Plane UI Parity (Visual Pass) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle ConqrHub's content surfaces (page lists, space cards, all-spaces table, tabs, page tree, search spotlight, empty states) to match ConqrPlan's look using the already-ported Plane design tokens.

**Architecture:** Pure client-side restyle. Keep Mantine components; style via colocated CSS modules referencing tokens from `packages/tokens/tokens.css` (`--txt-*`, `--bg-layer-*`, `--border-*`, `--shadow-*`). One new shared `PageList` component replaces three copy-pasted table lists; one new shared `SpaceCard` replaces two copy-pasted card blocks. No server, route, or data-fetching changes.

**Tech Stack:** React 18, Mantine v8, CSS modules (postcss-preset-mantine: `rem()`, `@mixin hover`, `light-dark()`), react-router-dom, Vite.

**Spec:** `docs/superpowers/specs/2026-09-01-plane-ui-parity-design.md`

## Global Constraints

- Only files under `apps/client/src/` change. No server code, no `packages/tokens` changes, no new dependencies.
- Every color/shadow/radius must come from an existing token in `packages/tokens/tokens.css` or a Mantine theme variable — verified names: `--txt-primary`, `--txt-secondary`, `--txt-tertiary`, `--txt-on-color`, `--txt-accent-primary`, `--txt-danger-primary`, `--bg-surface-1`, `--bg-layer-1`, `--bg-layer-2`, `--bg-layer-transparent-hover`, `--bg-layer-transparent-active`, `--bg-accent-subtle`, `--bg-danger-subtle`, `--border-subtle`, `--border-strong`, `--shadow-raised-200`, `--shadow-overlay-200`, `--alpha-black-500`, `--alpha-white-300`.
- Plane row/pill vocabulary: rows ~44px with `--bg-layer-transparent-hover` hover and hairline `0.5px solid var(--border-subtle)` dividers; metadata pills 20px tall, `0.5px solid var(--border-strong)`, `border-radius: 4px`, 11px text; section labels 11px uppercase `--txt-tertiary`.
- The client has no component test harness (server-only Jest). The test cycle per task is: `npx tsc --noEmit` from `apps/client` must pass, plus the final visual QA task (screenshots light + dark). Do not add a test framework.
- Behavior must not change: same links, same click targets, same query hooks, same i18n keys via `useTranslation()` — new user-visible strings must go through `t("...")`.
- Commit after each task (one commit per task, message given in the task).

---

### Task 1: Shared `PageList` component + adopt in the three list surfaces

**Files:**
- Create: `apps/client/src/components/common/page-list/page-list.tsx`
- Create: `apps/client/src/components/common/page-list/page-list.module.css`
- Modify: `apps/client/src/components/common/recent-changes.tsx`
- Modify: `apps/client/src/features/home/components/favorites-pages.tsx`
- Modify: `apps/client/src/features/home/components/created-by-me.tsx`

**Interfaces:**
- Consumes: existing hooks `useRecentChangesQuery`, `useFavoritesQuery`, `useCreatedByQuery`; `buildPageUrl`, `getSpaceUrl`, `formattedDate`.
- Produces: `PageList` default export and `PageListItem` type:
  ```ts
  export interface PageListItem {
    id: string;
    to: string;                 // page link
    icon?: React.ReactNode;     // emoji string or node; falls back to file icon
    title: string;
    spaceName?: string;         // omit when listing inside a space
    spaceTo?: string;           // space link for the pill
    date: string;               // preformatted display string
  }
  interface PageListProps {
    items: PageListItem[];
    hasNextPage?: boolean;
    isLoadingMore?: boolean;
    onLoadMore?: () => void;
  }
  ```

- [ ] **Step 1: Create `page-list.module.css`**

```css
.list {
    list-style: none;
    margin: 0;
    padding: 0;
}

.row {
    display: flex;
    align-items: center;
    gap: rem(8px);
    height: rem(44px);
    padding: 0 rem(8px);
    text-decoration: none;
    border-bottom: 0.5px solid var(--border-subtle);
    cursor: pointer;

    @mixin hover {
        background-color: var(--bg-layer-transparent-hover);
    }
}

.icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: rem(18px);
    flex-shrink: 0;
    color: var(--txt-icon-secondary);
    font-size: rem(15px);
}

.title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: rem(13px);
    font-weight: 500;
    color: var(--txt-primary);
}

.meta {
    display: flex;
    align-items: center;
    gap: rem(8px);
    flex-shrink: 0;
}

.pill {
    display: inline-flex;
    align-items: center;
    height: rem(20px);
    padding: 0 rem(10px);
    border: 0.5px solid var(--border-strong);
    border-radius: rem(4px);
    font-size: rem(11px);
    font-weight: 500;
    color: var(--txt-secondary);
    background-color: var(--bg-surface-1);
    max-width: rem(160px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    @mixin hover {
        background-color: var(--bg-layer-transparent-hover);
        color: var(--txt-primary);
    }
}

.date {
    font-size: rem(12px);
    font-weight: 500;
    color: var(--txt-tertiary);
    white-space: nowrap;
}
```

- [ ] **Step 2: Create `page-list.tsx`**

The row is a `Link`; the space pill is a `span` with its own click handler (nested `<a>` is invalid HTML), navigating via `useNavigate`.

```tsx
import { ReactNode } from "react";
import { Button } from "@mantine/core";
import { Link, useNavigate } from "react-router-dom";
import { IconFileDescription } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import classes from "./page-list.module.css";

export interface PageListItem {
  id: string;
  to: string;
  icon?: ReactNode;
  title: string;
  spaceName?: string;
  spaceTo?: string;
  date: string;
}

interface PageListProps {
  items: PageListItem[];
  hasNextPage?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

export default function PageList({
  items,
  hasNextPage,
  isLoadingMore,
  onLoadMore,
}: PageListProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div>
      <ul className={classes.list}>
        {items.map((item) => (
          <li key={item.id}>
            <Link to={item.to} className={classes.row}>
              <span className={classes.icon}>
                {item.icon || <IconFileDescription size={16} />}
              </span>
              <span className={classes.title}>
                {item.title || t("Untitled")}
              </span>
              <span className={classes.meta}>
                {item.spaceName && (
                  <span
                    className={classes.pill}
                    role="link"
                    tabIndex={0}
                    onClick={(e) => {
                      if (!item.spaceTo) return;
                      e.preventDefault();
                      e.stopPropagation();
                      navigate(item.spaceTo);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && item.spaceTo) {
                        e.preventDefault();
                        e.stopPropagation();
                        navigate(item.spaceTo);
                      }
                    }}
                  >
                    {item.spaceName}
                  </span>
                )}
                <span className={classes.date}>{item.date}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {hasNextPage && (
        <Button
          variant="subtle"
          fullWidth
          mt="sm"
          mb="xl"
          onClick={onLoadMore}
          loading={isLoadingMore}
        >
          {t("Load more")}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `recent-changes.tsx` to consume `PageList`**

Keep the loading / error / empty branches exactly as they are (they change in Task 7's component, not here). Replace everything from `<Table.ScrollContainer>` through the load-more button:

```tsx
import { Text } from "@mantine/core";
import PageListSkeleton from "@/components/ui/page-list-skeleton.tsx";
import PageList from "@/components/common/page-list/page-list.tsx";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { formattedDate } from "@/lib/time.ts";
import { useRecentChangesQuery } from "@/features/page/queries/page-query.ts";
import { IconFiles } from "@tabler/icons-react";
import { EmptyState } from "@/components/ui/empty-state.tsx";
import { getSpaceUrl } from "@/lib/config.ts";
import { useTranslation } from "react-i18next";

interface Props {
  spaceId?: string;
}

export default function RecentChanges({ spaceId }: Props) {
  const { t } = useTranslation();
  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useRecentChangesQuery(spaceId);
  const pages = data?.pages.flatMap((p) => p.items) ?? [];

  if (isLoading) {
    return <PageListSkeleton />;
  }

  if (isError) {
    return <Text>{t("Failed to fetch recent pages")}</Text>;
  }

  return pages.length > 0 ? (
    <PageList
      items={pages.map((page) => ({
        id: page.id,
        to: buildPageUrl(page?.space.slug, page.slugId, page.title),
        icon: page.icon,
        title: page.title,
        spaceName: spaceId ? undefined : page?.space.name,
        spaceTo: spaceId ? undefined : getSpaceUrl(page?.space.slug),
        date: formattedDate(page.updatedAt),
      }))}
      hasNextPage={hasNextPage}
      isLoadingMore={isFetchingNextPage}
      onLoadMore={() => fetchNextPage()}
    />
  ) : (
    <EmptyState
      icon={IconFiles}
      title={t("No pages yet")}
      description={t("Pages you create will show up here.")}
    />
  );
}
```

- [ ] **Step 4: Rewrite `favorites-pages.tsx` the same way**

Same shape; its items come from `favorites` (`fav.page` may be null — filter first), date is `formattedDate(new Date(fav.createdAt))`, space fields from `fav.space`:

```tsx
  return favorites.length > 0 ? (
    <PageList
      items={favorites
        .filter((fav) => fav.page)
        .map((fav) => ({
          id: fav.id,
          to: buildPageUrl(fav.space?.slug, fav.page.slugId, fav.page.title),
          icon: fav.page.icon,
          title: fav.page.title,
          spaceName: spaceId ? undefined : fav.space?.name,
          spaceTo:
            spaceId || !fav.space ? undefined : getSpaceUrl(fav.space.slug),
          date: formattedDate(new Date(fav.createdAt)),
        }))}
      hasNextPage={hasNextPage}
      isLoadingMore={isFetchingNextPage}
      onLoadMore={() => fetchNextPage()}
    />
  ) : (
    <EmptyState
      icon={IconStar}
      title={t("No favorites yet")}
      description={t("Pages you star will show up here.")}
    />
  );
```

Drop the now-unused imports (`Table`, `Group`, `UnstyledButton`, `Badge`, `ActionIcon`, `Button`, `IconFileDescription`, `getInitialsColor`).

- [ ] **Step 5: Rewrite `created-by-me.tsx` the same way** (date is `formattedDate(page.createdAt)`; everything else identical to Step 3's mapping).

- [ ] **Step 6: Typecheck**

Run from `apps/client`: `npx tsc --noEmit`
Expected: exit 0 (or only pre-existing errors — record a baseline with `git stash && npx tsc --noEmit` first if anything fails, then unstash).

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/components/common/page-list apps/client/src/components/common/recent-changes.tsx apps/client/src/features/home/components/favorites-pages.tsx apps/client/src/features/home/components/created-by-me.tsx
git commit -m "feat(client): Plane-style shared PageList for recent/favorites/created lists"
```

---

### Task 2: Shared `SpaceCard` with gradient banner (carousel + grid)

**Files:**
- Create: `apps/client/src/features/space/components/space-card.tsx`
- Create: `apps/client/src/features/space/components/space-card.module.css`
- Modify: `apps/client/src/features/space/components/space-carousel.tsx`
- Modify: `apps/client/src/features/space/components/space-grid.tsx`

**Interfaces:**
- Consumes: `getInitialsColor(name)` (returns a Mantine color name → gradient via `var(--mantine-color-<name>-8/5)`), `CustomAvatar`, `AvatarIconType.SPACE_ICON`, `getSpaceUrl`, `prefetchSpace`, `formatMemberCount`.
- Produces: `SpaceCard` default export:
  ```ts
  interface SpaceCardProps {
    space: {
      id: string; slug: string; name: string;
      description?: string; logo?: string; memberCount?: number;
    };
    topRight?: React.ReactNode; // hover-revealed action (grid passes StarButton)
  }
  ```
  Also `SpaceCardSkeleton` named export for the carousel's pending state.

No member `AvatarGroup`: the spaces list payload only carries `memberCount`, and adding per-space member queries is out of scope (YAGNI) — the count text stays.

- [ ] **Step 1: Create `space-card.module.css`**

```css
.card {
    background-color: var(--bg-surface-1);
    border-color: var(--border-subtle);
    overflow: hidden;
    transition: box-shadow 150ms ease;

    @mixin hover {
        box-shadow: var(--shadow-raised-200);
    }
}

.banner {
    position: relative;
    height: rem(76px);
}

.scrim {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, var(--alpha-black-500), transparent 65%);
}

.identity {
    position: absolute;
    left: rem(12px);
    right: rem(12px);
    bottom: rem(10px);
    display: flex;
    align-items: center;
    gap: rem(8px);
}

.logoTile {
    width: rem(36px);
    height: rem(36px);
    border-radius: rem(8px);
    background-color: var(--alpha-white-300);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.name {
    flex: 1;
    min-width: 0;
    color: #fff;
    font-size: rem(14px);
    font-weight: 600;
}

.topRight {
    position: absolute;
    top: rem(6px);
    right: rem(6px);
    opacity: 0;
    transition: opacity 150ms ease;
}

.topRight[data-favorited="true"],
.card:hover .topRight {
    opacity: 1;
}

.body {
    padding: rem(10px) rem(12px) rem(12px);
}

.description {
    font-size: rem(12px);
    color: var(--txt-secondary);
    min-height: rem(32px);
}

.members {
    margin-top: rem(8px);
    font-size: rem(11px);
    font-weight: 500;
    color: var(--txt-tertiary);
}
```

- [ ] **Step 2: Create `space-card.tsx`**

```tsx
import { ReactNode } from "react";
import { Card, Skeleton, Text } from "@mantine/core";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import { AvatarIconType } from "@/features/attachments/types/attachment.types.ts";
import { getInitialsColor } from "@/lib/get-initials-color.ts";
import { formatMemberCount } from "@/lib";
import { getSpaceUrl } from "@/lib/config.ts";
import { prefetchSpace } from "@/features/space/queries/space-query.ts";
import classes from "./space-card.module.css";

interface SpaceCardProps {
  space: {
    id: string;
    slug: string;
    name: string;
    description?: string;
    logo?: string;
    memberCount?: number;
  };
  topRight?: ReactNode;
}

export function SpaceCardSkeleton() {
  return (
    <Card p={0} radius="md" withBorder className={classes.card}>
      <Skeleton height={76} radius={0} />
      <div className={classes.body}>
        <Skeleton height={12} width="80%" radius="xl" />
        <Skeleton height={10} mt={10} width="40%" radius="xl" />
      </div>
    </Card>
  );
}

export default function SpaceCard({ space, topRight }: SpaceCardProps) {
  const { t } = useTranslation();
  const color = getInitialsColor(space.name);

  return (
    <Card
      p={0}
      radius="md"
      withBorder
      component={Link}
      to={getSpaceUrl(space.slug)}
      onMouseEnter={() => prefetchSpace(space.slug, space.id)}
      className={classes.card}
    >
      <div
        className={classes.banner}
        style={{
          background: `linear-gradient(135deg, var(--mantine-color-${color}-8), var(--mantine-color-${color}-5))`,
        }}
      >
        <div className={classes.scrim} />
        {topRight && <div className={classes.topRight}>{topRight}</div>}
        <div className={classes.identity}>
          <div className={classes.logoTile}>
            <CustomAvatar
              name={space.name}
              avatarUrl={space.logo}
              type={AvatarIconType.SPACE_ICON}
              color="initials"
              variant="filled"
              size="sm"
              radius="sm"
            />
          </div>
          <Text className={classes.name} lineClamp={1}>
            {space.name}
          </Text>
        </div>
      </div>
      <div className={classes.body}>
        <Text className={classes.description} lineClamp={2}>
          {space.description || t("No description")}
        </Text>
        <Text className={classes.members}>
          {formatMemberCount(space.memberCount ?? 0, t)}
        </Text>
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: Adopt in `space-carousel.tsx`**

Delete the local `SpaceCardSkeleton` and the inline `<Card>` block. Import `SpaceCard, { SpaceCardSkeleton }` — carousel keeps its 220px sizing by wrapping: the card list becomes

```tsx
  const cards = data?.items.map((space) => (
    <div key={space.id} style={{ width: 220 }}>
      <SpaceCard space={space} />
    </div>
  ));
```

and the pending branch renders `<div style={{ width: 220 }}><SpaceCardSkeleton /></div>` × 4 inside `CardCarousel`. Remove now-unused imports (`Card`, `rem`, `Skeleton`, `CustomAvatar`, `AvatarIconType`, `prefetchSpace` if unused, `classes`). Delete `space-carousel.module.css` if nothing references it afterwards.

- [ ] **Step 4: Adopt in `space-grid.tsx`**

```tsx
  const cards = data?.items.slice(0, 6).map((space) => (
    <SpaceCard
      key={space.id}
      space={space}
      topRight={
        <div data-favorited={spaceFavoriteIds.has(space.id)}>
          <StarButton type="space" spaceId={space.id} size={16} />
        </div>
      }
    />
  ));
```

Note: the `data-favorited` attribute must live on the element the CSS targets — pass it through by rendering `topRight` inside `.topRight` and ALSO forward the attribute: in `space-card.tsx` the wrapper is `<div className={classes.topRight}>{topRight}</div>`, so `.topRight[data-favorited="true"]` will not match. Fix in the CSS instead: use `.topRight:has([data-favorited="true"])` alongside `.card:hover .topRight`. Update the module CSS selector accordingly:

```css
.topRight:has([data-favorited="true"]),
.card:hover .topRight {
    opacity: 1;
}
```

Remove now-unused imports and delete `space-grid.module.css` if fully unused (check `.icon` usages first — it is not imported anywhere else).

- [ ] **Step 5: Typecheck** — `npx tsc --noEmit` from `apps/client`, expect baseline-clean.

- [ ] **Step 6: Commit**

```bash
git add -A apps/client/src/features/space/components
git commit -m "feat(client): Plane-style SpaceCard with gradient banner for carousel and grid"
```

---

### Task 3: All-spaces table restyle

**Files:**
- Modify: `apps/client/src/features/space/components/spaces-page/all-spaces-list.tsx`
- Modify: `apps/client/src/features/space/components/spaces-page/all-spaces-list.module.css`

**Interfaces:** none new — purely presentational.

- [ ] **Step 1: Append to `all-spaces-list.module.css`** (keep existing rules):

```css
.table {
    --table-border-color: var(--border-subtle);
    --table-hover-color: var(--bg-layer-transparent-hover);
}

.th {
    font-size: rem(11px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--txt-tertiary);
}

.td {
    font-size: rem(13px);
}
```

- [ ] **Step 2: Wire the classes in `all-spaces-list.tsx`**

Change the `<Table>` opening tag to:

```tsx
        <Table
          highlightOnHover
          verticalSpacing={8}
          className={classes.table}
          classNames={{ th: classes.th, td: classes.td }}
        >
```

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` from `apps/client`.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/features/space/components/spaces-page
git commit -m "style(client): Plane list idiom for the all-spaces table"
```

---

### Task 4: Tabs chrome

**Files:**
- Modify: `apps/client/src/theme.ts` (the existing `Tabs.extend` block at `components.Tabs`)

**Interfaces:** none — both `home-tabs.tsx` and `space-home-tabs.tsx` pass `color="dark"` and inherit this automatically. Do not edit those two files.

- [ ] **Step 1: Replace the `Tabs.extend` block in `theme.ts`**

Current block maps `--tabs-color` to `--mantine-color-dark-default`. Replace with:

```ts
    Tabs: Tabs.extend({
      vars: (theme, props) => ({
        root: {
          ...(props.color === "dark" && {
            // Plane: active-tab underline in text-primary, not accent
            "--tabs-color": "var(--txt-primary)",
          }),
        },
      }),
      styles: {
        tab: {
          fontSize: "13px",
          fontWeight: 500,
          color: "var(--txt-secondary)",
          paddingTop: "8px",
          paddingBottom: "8px",
        },
      },
      classNames: { tab: "conqr-tab" },
    }),
```

and add once to the file that owns global styles for the theme — since there is no global stylesheet, use Mantine's data-attribute styling instead of a class: DELETE the `classNames` line above and instead extend `styles` with a selector-free approach. Mantine `styles.tab` cannot express `&[data-active]`, so add a small CSS module is overkill for two selectors — put them in `packages` is forbidden. Resolution: create `apps/client/src/styles/tabs.css` with:

```css
.mantine-Tabs-tab[data-active] {
    color: var(--txt-primary);
}

.mantine-Tabs-tab:hover {
    background-color: var(--bg-layer-transparent-hover);
}
```

and import it in `apps/client/src/main.tsx` after the Mantine style imports (`import "./styles/tabs.css";`). Keep the `vars` + `styles` from the block above, drop the `classNames` line.

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` from `apps/client`.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/theme.ts apps/client/src/styles/tabs.css apps/client/src/main.tsx
git commit -m "style(client): Plane tab chrome via theme override"
```

---

### Task 5: Page tree token conversion

**Files:**
- Modify: `apps/client/src/features/page/tree/styles/tree.module.css`

**Interfaces:** none — class names consumed by `space-tree.tsx` stay identical (`.tree`, `.treeContainer`, `.node`, `.actions`, `.row`, `.icon`, `.text`, `.arrow`).

- [ ] **Step 1: Replace the color rules in `tree.module.css`**

Keep structure/layout rules; swap every `light-dark(var(--mantine-color-...))` for tokens and clean out the commented-out experiments:

```css
.tree {
    border-radius: 0;
}

.treeContainer {
    height: 100%;
    min-width: 0;

    > div, > div > .tree {
        height: 100% !important;
    }
}

.node {
    position: relative;
    border-radius: var(--mantine-radius-md);
    display: flex;
    align-items: center;
    height: 100%;
    width: 93%; /* not to overlap with scroll bar */
    text-decoration: none;
    color: var(--txt-secondary);

    &:hover {
        background-color: var(--bg-layer-transparent-hover);
        color: var(--txt-primary);
    }

    .actions {
        visibility: hidden;
        position: absolute;
        height: 100%;
        top: 0;
        right: 0;
        border-top-right-radius: var(--mantine-radius-md);
        border-bottom-right-radius: var(--mantine-radius-md);
        background-color: var(--bg-layer-2);
    }

    &:hover .actions {
        visibility: visible;
    }
}

.node:global(.willReceiveDrop) {
    background-color: var(--bg-accent-subtle);
}

.node:global(.isSelected) {
    border-radius: 0;
    background-color: var(--bg-layer-transparent-active);
    color: var(--txt-primary);
}

.node:global(.isSelectedStart.isSelectedEnd) {
    border-radius: var(--mantine-radius-md);
}

.row:focus .node:global(.isSelected),
.row:focus .node:global(.isFocused) {
    background-color: var(--bg-layer-transparent-active);
}

.row {
    white-space: nowrap;
    cursor: pointer;
}

.row:focus {
    outline: none;
}

.icon {
    margin: 0 rem(10px);
    flex-shrink: 0;
}

.text {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: rem(13px);
    font-weight: 500;
}

.arrow {
    display: flex;
}

[role="treeitem"] {
    padding-bottom: 2px;
}
```

- [ ] **Step 2: Typecheck** (CSS-only change, but confirm the module still resolves) — `npx tsc --noEmit` from `apps/client`.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/features/page/tree/styles/tree.module.css
git commit -m "style(client): page tree rows on Plane tokens"
```

---

### Task 6: Search spotlight restyle

**Files:**
- Create: `apps/client/src/features/search/components/search-spotlight.module.css`
- Modify: `apps/client/src/features/search/components/search-spotlight.tsx`
- Modify: `apps/client/src/features/search/components/search-result-item.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Create `search-spotlight.module.css`**

```css
.content {
    background-color: var(--bg-surface-1);
    border: 1px solid var(--border-subtle);
    box-shadow: var(--shadow-overlay-200);
}

.action {
    border-radius: var(--mantine-radius-md);
    padding: rem(8px) rem(12px);

    &:hover,
    &[data-selected] {
        background-color: var(--bg-layer-transparent-hover);
    }
}

.actionsGroup {
    font-size: rem(11px);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--txt-tertiary);
}

.pill {
    display: inline-flex;
    align-items: center;
    height: rem(20px);
    padding: 0 rem(10px);
    border: 0.5px solid var(--border-strong);
    border-radius: rem(4px);
    font-size: rem(11px);
    font-weight: 500;
    color: var(--txt-secondary);
    background-color: var(--bg-surface-1);
    white-space: nowrap;
}
```

- [ ] **Step 2: Wire root classes in `search-spotlight.tsx`**

```tsx
import classes from "./search-spotlight.module.css";
```

and extend the `<Spotlight.Root>` props with:

```tsx
        classNames={{
          content: classes.content,
          action: classes.action,
          actionsGroup: classes.actionsGroup,
        }}
```

(leave all other props untouched).

- [ ] **Step 3: Pill metadata in `search-result-item.tsx`**

Import the same module (`import classes from "./search-spotlight.module.css";`). In the page branch replace

```tsx
            {showSpace && pageResult.space && (
              <Badge variant="light" size="xs" color="gray">
                {pageResult.space.name}
              </Badge>
            )}
```

with

```tsx
            {showSpace && pageResult.space && (
              <span className={classes.pill}>{pageResult.space.name}</span>
            )}
```

and change both title `<Text>` elements (page title, attachment `fileName`) to `<Text fz={13} fw={500}>`. Drop the now-unused `Badge` import if nothing else uses it.

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit` from `apps/client`.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/search/components
git commit -m "style(client): Plane power-K look for the search spotlight"
```

---

### Task 7: Empty states, no-results row, skeleton

**Files:**
- Modify: `apps/client/src/components/ui/empty-state.tsx`
- Modify: `apps/client/src/components/ui/empty-state.module.css`
- Modify: `apps/client/src/components/common/no-table-results.tsx`
- Modify: `apps/client/src/components/ui/page-list-skeleton.tsx`

**Interfaces:** `EmptyState` props are UNCHANGED (`icon`, `title`, `description`, `action`, `variant`) — many callers exist; do not touch its API. `NoTableResults` props unchanged (`colSpan`, `text`).

- [ ] **Step 1: Extend `empty-state.module.css`**

```css
.root {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.tile {
  display: flex;
  align-items: center;
  justify-content: center;
  width: rem(48px);
  height: rem(48px);
  border-radius: var(--mantine-radius-lg);
  background-color: var(--bg-accent-subtle);
  color: var(--txt-accent-primary);
}

.tileDanger {
  background-color: var(--bg-danger-subtle);
  color: var(--txt-danger-primary);
}

.title {
  font-size: rem(14px);
  font-weight: 600;
  color: var(--txt-primary);
}

.description {
  font-size: rem(13px);
  color: var(--txt-secondary);
}
```

- [ ] **Step 2: Rewrite `empty-state.tsx` render (API unchanged)**

```tsx
import { Stack, Text, Loader, Center } from "@mantine/core";
import { type TablerIcon, IconAlertTriangle } from "@tabler/icons-react";
import { ReactNode } from "react";
import clsx from "clsx";
import classes from "./empty-state.module.css";

type EmptyStateVariant = "default" | "loading" | "error";

type EmptyStateProps = {
  icon?: TablerIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  variant?: EmptyStateVariant;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "default",
}: EmptyStateProps) {
  if (variant === "loading") {
    return (
      <Center className={classes.root}>
        <Stack align="center" gap="md">
          <Loader size="md" />
          <Text className={classes.description}>{title}</Text>
        </Stack>
      </Center>
    );
  }

  const isError = variant === "error";
  const TileIcon = isError ? (Icon ?? IconAlertTriangle) : Icon;

  return (
    <div className={classes.root}>
      <Stack align="center" gap="xs">
        {TileIcon && (
          <div className={clsx(classes.tile, isError && classes.tileDanger)}>
            <TileIcon size={24} stroke={1.5} />
          </div>
        )}
        <Text className={classes.title}>{title}</Text>
        {description && (
          <Text className={classes.description} maw={350}>
            {description}
          </Text>
        )}
        {action}
      </Stack>
    </div>
  );
}
```

(`clsx` is already a Mantine dependency; if the import fails at typecheck, use a template string instead: `` className={`${classes.tile} ${isError ? classes.tileDanger : ""}`} ``.)

- [ ] **Step 3: Restyle `no-table-results.tsx` text**

```tsx
        <Text fw={500} fz={13} c="var(--txt-tertiary)" ta="center" py="lg">
          {text || t("No results found...")}
        </Text>
```

- [ ] **Step 4: Rewrite `page-list-skeleton.tsx`** (rows match the new 44px `PageList` rows)

```tsx
import { Skeleton } from "@mantine/core";

export default function PageListSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} height={36} my={8} radius="md" />
      ))}
    </>
  );
}
```

- [ ] **Step 5: Typecheck** — `npx tsc --noEmit` from `apps/client`.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/components/ui/empty-state.tsx apps/client/src/components/ui/empty-state.module.css apps/client/src/components/common/no-table-results.tsx apps/client/src/components/ui/page-list-skeleton.tsx
git commit -m "style(client): CenteredState empty states and pulse skeletons"
```

---

### Task 8: Build gate + visual QA (light and dark)

**Files:** none created — verification only (fix regressions in the files above if found).

- [ ] **Step 1: Full client build**

Run from repo root: `pnpm run client:build`
Expected: exit 0.

- [ ] **Step 2: Start the dev stack** — `docker-compose up -d db redis` then `pnpm run dev` (client at `http://localhost:5173`, backend `:3000`). If a `.env` is missing, `cp .env.example .env` and set `APP_SECRET` to any 32+ char string.

- [ ] **Step 3: Screenshot each changed surface in BOTH themes** (headless browser): home (tabs + recent list + space cards), a space home, `/spaces` (all-spaces table + favorite grid), sidebar page tree with hover/selected states, the search spotlight (Ctrl+K) with results, an empty favorites tab (empty state), and a hard-refresh loading skeleton. Toggle dark mode via the theme toggle.

- [ ] **Step 4: Compare against ConqrPlan** — open the deployed ConqrPlan (`https://proxy-production-5f3e.up.railway.app`) work-item list and project cards side by side; check row density, pill geometry, hover tones, tab chrome. Fix any mismatch or contrast bug (especially dark-mode `--alpha-white-300` logo tile legibility) in the task files, re-screenshot.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A apps/client/src
git commit -m "fix(client): visual QA fixes for Plane parity pass"
```

---

## Self-review notes

- Spec coverage: spec §1→Task 1, §2→Task 2, §3→Task 3, §4→Task 4, §5→Task 5 (narrowed: global/space sidebars were found already tokenized — only the tree remained), §6→Task 6, §7→Task 7, testing→Task 8. Out-of-scope items remain out.
- Type consistency: `PageListItem`/`PageList` names match between Task 1 definition and consumers; `SpaceCard`/`SpaceCardSkeleton` match Task 2 usages.
- No placeholder steps; all code inline.
