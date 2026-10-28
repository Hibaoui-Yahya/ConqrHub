import { describe, expect, it } from "vitest";
import { buildNews, buildResume, buildTodo, homeSummary } from "./home-items";

const n = (over: Record<string, unknown>) => ({
  id: String(Math.random()),
  type: "page.user_mention",
  readAt: null,
  createdAt: "2026-10-13T10:00:00Z",
  data: null,
  actor: { name: "Sophie" },
  page: { title: "Procédure", slugId: "abc" },
  space: { slug: "rh" },
  ...over,
});

describe("buildTodo", () => {
  it("keeps unread actionable notifications, ordered by priority then date", () => {
    const items = buildTodo(
      [
        n({ id: "a", type: "page.user_mention", createdAt: "2026-10-13T12:00:00Z" }),
        n({ id: "b", type: "page.approval_requested" }),
        n({ id: "c", type: "page.updated" }),
        n({ id: "d", type: "page.user_mention", readAt: "2026-10-13T11:00:00Z" }),
        n({ id: "e", type: "page.verification_expiring", page: { title: "Grille", slugId: "g" } }),
      ],
      [],
    );
    expect(items.map((i) => [i.key, i.kind])).toEqual([
      ["b", "approval"],
      ["a", "mention"],
      ["e", "verification"],
    ]);
    expect(items[1].actorName).toBe("Sophie");
  });

  it("adds my meetings to review, once per meeting; never 'ready to publish' while publishing is suspended", () => {
    const items = buildTodo(
      [n({ id: "m", type: "meeting.review_needed", data: { meetingId: "m1", meetingTitle: "Entrevue" } })],
      [
        { id: "m1", title: "Entrevue", status: "awaiting_review", startedAt: "2026-10-13T09:00:00Z" },
        { id: "m2", title: "Mandat", status: "completed", startedAt: "2026-10-12T09:00:00Z" },
        { id: "m3", title: "Publiée", status: "completed", startedAt: "2026-10-12T09:00:00Z", settings: { publishedBundle: { meetingPageId: "p" } } },
        { id: "m4", title: "En cours", status: "analyzing", startedAt: "2026-10-12T09:00:00Z" },
      ],
    );
    // m2 is done but unpublished: Strict Private phase 0 offers no publish task.
    expect(items.map((i) => [i.meetingId, i.kind])).toEqual([["m1", "meeting-review"]]);
  });

  it("separates speakers to confirm and failed meetings, failed first", () => {
    const items = buildTodo([], [
      { id: "s", title: "S", status: "speakers_pending_review", startedAt: "2026-10-13T09:00:00Z" },
      { id: "f", title: "F", status: "failed", startedAt: "2026-10-12T09:00:00Z" },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["meeting-failed", "meeting-speakers"]);
  });

  it("collapses repeated notifications on the same page", () => {
    const items = buildTodo([n({ id: "x" }), n({ id: "y" })], []);
    expect(items).toHaveLength(1);
  });
});

describe("buildResume and buildNews", () => {
  const p = (id: string, updatedAt: string, by = "me") => ({ id, title: id, slugId: id, updatedAt, lastUpdatedById: by });
  it("merges my pages and favourites, newest first, marking favourites", () => {
    const r = buildResume([p("a", "2026-10-10"), p("b", "2026-10-12")], [p("b", "2026-10-12"), p("c", "2026-10-11", "x")]);
    expect(r.map((i) => [i.page.id, i.favorite])).toEqual([["b", true], ["c", true], ["a", false]]);
  });
  it("keeps only changes made by others and not already shown", () => {
    expect(buildNews([p("a", "1", "me"), p("b", "1", "x"), p("c", "1", "y")], "me", new Set(["c"])).map((x) => x.id)).toEqual(["b"]);
  });
  it("summarises the day", () => {
    expect(homeSummary(2, 3).values).toEqual({ todo: 2, news: 3 });
    expect(homeSummary(0, 0).key).toBe("You are up to date.");
  });
});
