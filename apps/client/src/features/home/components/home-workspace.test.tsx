import { render, screen, within } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The Home renders the same block for every section, in a fixed order,
 * shows only rows built from data the user already has, and shows the
 * managers-only block to space managers only.
 */

const state: any = {};
const inf = (items: unknown[]) => ({ data: { pages: [{ items }] }, isLoading: false });

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => undefined },
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? key.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? "")) : key,
  }),
}));
vi.mock("jotai", async (orig) => ({
  ...(await orig<any>()),
  useAtomValue: (atom: any) => (atom === "user" ? state.user : state.workspace),
}));
vi.mock("@/features/user/atoms/current-user-atom.ts", () => ({ currentUserAtom: "user", workspaceAtom: "workspace" }));
vi.mock("@/lib/api-client", () => ({ default: { get: vi.fn(async () => ({ items: state.meetings })) } }));
vi.mock("@/lib/config.ts", () => ({ getSuiteAppUrls: () => ({ meet: "https://ltc.conqrmeet.com" }), getSpaceUrl: (s: string) => `/s/${s}` }));
vi.mock("@/features/notification/queries/notification-query", () => ({
  useNotificationsQuery: () => inf(state.notifications),
  useMarkReadMutation: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/features/page/queries/page-query.ts", () => ({
  useCreatedByQuery: () => inf(state.created),
  useRecentChangesQuery: () => inf(state.recent),
}));
vi.mock("@/features/favorite/queries/favorite-query.ts", () => ({ useFavoritesQuery: () => inf([]) }));
vi.mock("@/features/space/queries/space-query.ts", () => ({ useGetSpacesQuery: () => ({ data: { items: state.spaces } }) }));
vi.mock("@/ee/page-verification/queries/page-verification-query.ts", () => ({
  useVerificationOverviewQuery: (_: unknown, o: { enabled: boolean }) => ({
    data: o.enabled ? { verified: 7, expiring: 1, expired: 1, draft: 1, inApproval: 0, obsolete: 0, none: 0, total: 10, unverified: 3, spaces: [{ spaceId: "s1", spaceName: "Groupe Lumen", spaceSlug: "lumen", total: 5, verified: 2, unverified: 3 }] } : undefined,
  }),
}));
vi.mock("@/lib/time.ts", () => ({ timeAgo: () => "il y a peu" }));
vi.mock("@/features/search/constants.ts", () => ({ searchSpotlight: { open: vi.fn() } }));
vi.mock("@/hooks/use-user-role.tsx", () => ({ default: () => ({ isAdmin: state.isAdmin }) }));

import HomeWorkspace from "./home-workspace";

const renderHome = () =>
  render(
    <MantineProvider>
      <MemoryRouter>
        <HomeWorkspace />
      </MemoryRouter>
    </MantineProvider>,
  );

beforeEach(() => {
  state.user = { user: { id: "annie", name: "Annie Bissonnette" } };
  state.workspace = { settings: { ai: { chat: true } } };
  state.meetings = [
    { id: "m1", title: "Entrevue — Julie Tremblay", status: "awaiting_review", startedAt: "2026-10-13T09:00:00Z" },
    { id: "m2", title: "Point équipe", status: "completed", startedAt: "2026-10-12T09:00:00Z" },
  ];
  state.notifications = [
    { id: "n1", type: "page.user_mention", readAt: null, createdAt: "2026-10-13T10:00:00Z", actor: { name: "Sophie" }, page: { title: "Procédure", slugId: "p1" }, space: { slug: "rh" } },
  ];
  state.created = [{ id: "c1", title: "Notes de calibrage", slugId: "c1", updatedAt: "2026-10-12T10:00:00Z", creatorId: "annie", lastUpdatedById: "annie", space: { slug: "lumen", name: "Groupe Lumen" } }];
  state.recent = [
    { id: "r1", title: "Politique de télétravail", slugId: "r1", updatedAt: "2026-10-13T08:00:00Z", lastUpdatedById: "marc", lastUpdatedBy: { name: "Marc" }, space: { slug: "rh", name: "RH interne" } },
    { id: "c1", title: "Notes de calibrage", slugId: "c1", updatedAt: "2026-10-12T10:00:00Z", lastUpdatedById: "annie", space: { slug: "lumen" } },
  ];
  state.spaces = [{ id: "s1", name: "Groupe Lumen", slug: "lumen", membership: { role: "writer" } }];
  state.isAdmin = false;
});

describe("HomeWorkspace", () => {
  it("shows search, then the three blocks in order, each with its rows", async () => {
    renderHome();
    expect(screen.getByText("Hello, Annie")).toBeTruthy();
    expect(screen.getByText("Search a procedure, a mandate, a meeting, a person…")).toBeTruthy();
    expect(screen.getByText("Ask AI")).toBeTruthy();
    const titles = ["To handle", "Pick up where you left off", "New in my spaces"].map((t) => screen.getByText(t));
    // fixed order in the document
    expect(titles[0].compareDocumentPosition(titles[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(titles[1].compareDocumentPosition(titles[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(await screen.findByText("Sophie mentioned you in « Procédure »")).toBeTruthy();
    expect(await screen.findByText("Meeting to review: Entrevue — Julie Tremblay")).toBeTruthy();
    // Strict Private phase 0: publishing is suspended, so no publish task.
    expect(screen.queryByText(/Ready to publish/)).toBeNull();
    // my own edit is in "Reprendre", not repeated in "Nouveau"
    expect(screen.getAllByText("Notes de calibrage")).toHaveLength(1);
    expect(screen.getByText("Politique de télétravail")).toBeTruthy();
    expect(screen.queryByText("State of my spaces")).toBeNull();
  });

  it("shows the managers block to space admins only", () => {
    state.spaces = [{ id: "s1", name: "Groupe Lumen", slug: "lumen", membership: { role: "admin" } }];
    renderHome();
    const block = screen.getByText("State of my spaces").closest(".mantine-Card-root") as HTMLElement;
    expect(within(block).getByText("80 %")).toBeTruthy();
    expect(within(block).getByText("Groupe Lumen")).toBeTruthy();
  });

  it("folds empty blocks into one line and hides AI when it is off", async () => {
    state.notifications = [];
    state.meetings = [];
    state.created = [];
    state.recent = [];
    state.workspace = { settings: { ai: { chat: false } } };
    renderHome();
    expect(await screen.findByText(/Nothing waits for you/)).toBeTruthy();
    expect(screen.getByText("Nothing new from your colleagues for now.")).toBeTruthy();
    expect(screen.queryByText("Ask AI")).toBeNull();
    expect(screen.getByText("You are up to date.")).toBeTruthy();
  });
});
