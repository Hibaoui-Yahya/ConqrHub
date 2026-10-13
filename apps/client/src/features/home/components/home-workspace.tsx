import { useEffect, useMemo, useState } from "react";
import { Anchor, Badge, Button, Group, Paper, SimpleGrid, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import {
  IconActivity,
  IconAlertTriangle,
  IconAt,
  IconFilePencil,
  IconFileText,
  IconHistory,
  IconInbox,
  IconMicrophone,
  IconSearch,
  IconShieldCheck,
  IconSparkles,
  IconStar,
  IconUserCheck,
} from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api-client";
import { getSpaceUrl, getSuiteAppUrls } from "@/lib/config.ts";
import { timeAgo } from "@/lib/time.ts";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { currentUserAtom, workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useNotificationsQuery, useMarkReadMutation } from "@/features/notification/queries/notification-query";
import { useCreatedByQuery, useRecentChangesQuery } from "@/features/page/queries/page-query.ts";
import { useFavoritesQuery } from "@/features/favorite/queries/favorite-query.ts";
import { useGetSpacesQuery } from "@/features/space/queries/space-query.ts";
import { useVerificationOverviewQuery } from "@/ee/page-verification/queries/page-verification-query.ts";
import { searchSpotlight } from "@/features/search/constants.ts";
import useUserRole from "@/hooks/use-user-role.tsx";
import { SpaceRole } from "@/lib/types.ts";
import { HomeBlock, HomeRow } from "./home-block";
import {
  HOME_MAX_ROWS,
  buildNews,
  buildResume,
  buildTodo,
  homeSummary,
  type TodoItem,
} from "../home-items";

const TODO_ICON = {
  mention: IconAt,
  approval: IconUserCheck,
  rejected: IconAlertTriangle,
  verification: IconShieldCheck,
  "meeting-review": IconMicrophone,
  "meeting-failed": IconAlertTriangle,
  "meeting-publish": IconMicrophone,
} as const;

function useMyMeetings(enabled: boolean) {
  const [items, setItems] = useState<any[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const load = () =>
      api
        .get("/ai/meeting", { params: { scope: "mine", limit: 30 } })
        .then((res: any) => {
          const body = res?.data ?? res;
          setItems(Array.isArray(body) ? body : (body?.items ?? []));
        })
        .catch(() => setItems([]));
    load();
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled]);
  return items;
}

/**
 * The Home: one search, then three questions in a fixed order — what is
 * waiting for me, where was I, what changed in my spaces — plus, for space
 * managers, the state of their knowledge. Every section is a HomeBlock.
 */
export default function HomeWorkspace() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currentUser = useAtomValue(currentUserAtom);
  const workspace = useAtomValue(workspaceAtom);
  const me = currentUser?.user;
  const { isAdmin } = useUserRole();
  const meet = getSuiteAppUrls().meet;
  const aiChat = workspace?.settings?.ai?.chat === true;

  const notifications = useNotificationsQuery("direct");
  const markRead = useMarkReadMutation();
  const myMeetings = useMyMeetings(true);
  const created = useCreatedByQuery({ userId: me?.id });
  const favorites = useFavoritesQuery("page");
  const recent = useRecentChangesQuery();
  const spaces = useGetSpacesQuery({ page: 1, limit: 8 } as any);
  const spaceItems = spaces.data?.items ?? [];
  const managesSpaces = isAdmin || spaceItems.some((s) => s.membership?.role === SpaceRole.ADMIN);
  const health = useVerificationOverviewQuery(undefined, { enabled: managesSpaces });

  const todo = useMemo(
    () =>
      buildTodo(
        (notifications.data?.pages ?? []).flatMap((p: any) => p.items) as any[],
        myMeetings ?? [],
      ),
    [notifications.data, myMeetings],
  );
  const resume = useMemo(
    () =>
      buildResume(
        (created.data?.pages ?? []).flatMap((p: any) => p.items) as any[],
        ((favorites.data?.pages ?? []).flatMap((p: any) => p.items) as any[])
          // A favourite carries the page without its update date: use the
          // date it was starred so it sorts among my recent pages.
          .map((f: any) => f.page && { ...f.page, updatedAt: f.createdAt, space: f.space })
          .filter(Boolean),
      ),
    [created.data, favorites.data],
  );
  const resumeIds = useMemo(() => new Set(resume.slice(0, HOME_MAX_ROWS).map((r) => r.page.id)), [resume]);
  const news = useMemo(
    () => buildNews((recent.data?.pages ?? []).flatMap((p: any) => p.items) as any[], me?.id, resumeIds),
    [recent.data, me?.id, resumeIds],
  );

  const firstName = (me?.name || "").split(" ")[0];
  const summary = homeSummary(todo.length, news.length);
  const meetingHref = (id?: string) => (meet && id ? `${meet}/meetings/${id}` : undefined);
  const ago = (d: string | Date) => timeAgo(new Date(d));

  const todoRow = (item: TodoItem, index: number) => {
    const pageTo =
      item.pageSlugId && item.spaceSlug ? buildPageUrl(item.spaceSlug, item.pageSlugId, item.pageTitle) : undefined;
    const open = () => item.notificationId && markRead.mutate([item.notificationId]);
    const page = item.pageTitle ? `« ${item.pageTitle} »` : t("a page");
    const meeting = item.meetingTitle || t("Untitled meeting");
    const rows: Record<TodoItem["kind"], { title: string; detail: string; action: string }> = {
      mention: { title: t("{{name}} mentioned you in {{page}}", { name: item.actorName ?? t("Someone"), page }), detail: ago(item.at), action: t("Reply") },
      approval: { title: t("{{name}} asks for your approval: {{page}}", { name: item.actorName ?? t("Someone"), page }), detail: t("Page approval"), action: t("Review") },
      rejected: { title: t("Approval declined: {{page}}", { page }), detail: ago(item.at), action: t("Open") },
      verification: { title: t("{{page}} needs to be verified again", { page }), detail: t("You are a verifier of this page"), action: t("Review") },
      "meeting-review": { title: t("Meeting to review: {{title}}", { title: meeting }), detail: t("In ConqrMeet · speakers and actions"), action: t("Review") },
      "meeting-failed": { title: t("Processing failed: {{title}}", { title: meeting }), detail: t("In ConqrMeet"), action: t("Open") },
      "meeting-publish": { title: t("Ready to publish: {{title}}", { title: meeting }), detail: t("In ConqrMeet · report and transcript"), action: t("Publish") },
    };
    const r = rows[item.kind];
    const href = item.meetingId ? meetingHref(item.meetingId) : undefined;
    return (
      <HomeRow
        key={item.key}
        icon={TODO_ICON[item.kind]}
        title={r.title}
        detail={r.detail}
        to={href ? undefined : pageTo}
        href={href}
        onOpen={open}
        action={r.action}
        primary={index === 0}
      />
    );
  };

  const loadingTodo = notifications.isLoading || myMeetings === null;
  const weakest = [...(health.data?.spaces ?? [])]
    .filter((s) => s.total >= 3)
    .sort((a, b) => a.verified / a.total - b.verified / b.total)[0];
  const pct = (v: number, total: number) => (total ? Math.round((v / total) * 100) : 0);

  return (
    <Stack gap="lg">
      <div>
        <Title order={2} fw={600}>
          {firstName ? t("Hello, {{name}}", { name: firstName }) : t("Hello")}
        </Title>
        <Text size="sm" c="dimmed">
          {t(summary.key, summary.values)}
        </Text>
      </div>

      {/* 0 · Chercher ou demander */}
      <Paper withBorder radius="md" px="md" py={10} style={{ borderColor: "var(--bg-accent-primary, var(--mantine-primary-color-filled))" }}>
        <Group gap="sm" wrap="nowrap">
          <IconSearch size={18} color="var(--brand-default)" />
          <UnstyledButton onClick={() => searchSpotlight.open()} style={{ flex: 1, minWidth: 0 }} aria-label={t("Search")}>
            <Text size="sm" c="dimmed" truncate>
              {t("Search a procedure, a mandate, a meeting, a person…")}
            </Text>
          </UnstyledButton>
          {aiChat && (
            <Button size="compact-sm" variant="light" leftSection={<IconSparkles size={14} />} onClick={() => navigate("/ai")}>
              {t("Ask AI")}
            </Button>
          )}
          <Badge variant="default" radius="sm" visibleFrom="sm">
            Ctrl K
          </Badge>
        </Group>
      </Paper>

      {/* 1 · À traiter */}
      <HomeBlock
        icon={IconInbox}
        title={t("To handle")}
        count={todo.length}
        loading={loadingTodo}
        isEmpty={todo.length === 0}
        emptyText={t("Nothing waits for you. Mentions, approvals, verifications and meetings to publish will appear here.")}
      >
        {todo.slice(0, HOME_MAX_ROWS).map(todoRow)}
      </HomeBlock>

      {/* + · État de mes espaces (responsables d'espace) */}
      {managesSpaces && health.data && health.data.total > 0 && (
        <HomeBlock
          icon={IconActivity}
          title={t("State of my spaces")}
          tone="quiet"
          isEmpty={false}
          emptyText=""
          aside={
            <Badge size="xs" variant="outline" color="gray" radius="xl">
              {t("Space managers")}
            </Badge>
          }
          seeAll={{ label: t("Details"), to: "/settings/knowledge-base" }}
        >
          <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm" p="md">
            <Kpi value={`${pct(health.data.verified + health.data.expiring, health.data.total)} %`} label={t("pages verified (used by AI)")} />
            <Kpi value={String(health.data.expiring)} label={t("expire within 7 days")} warn={health.data.expiring > 0} />
            <Kpi value={String(health.data.expired + health.data.draft)} label={t("to verify again")} warn={health.data.expired > 0} />
            {weakest ? (
              <Kpi value={weakest.spaceName} label={t("{{pct}} % verified — to watch", { pct: pct(weakest.verified, weakest.total) })} warn small />
            ) : (
              <Kpi value={String(health.data.spaces.length)} label={t("spaces followed")} />
            )}
          </SimpleGrid>
        </HomeBlock>
      )}

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        {/* 2 · Reprendre */}
        <HomeBlock
          icon={IconHistory}
          title={t("Pick up where you left off")}
          loading={created.isLoading || favorites.isLoading}
          isEmpty={resume.length === 0}
          emptyText={t("Pages you write or add to favourites will appear here.")}
          seeAll={resume.length > HOME_MAX_ROWS ? { label: t("See all"), to: "/favorites" } : undefined}
        >
          {resume.slice(0, HOME_MAX_ROWS).map(({ page, favorite }) => (
            <HomeRow
              key={page.id}
              icon={favorite ? IconStar : page.creatorId === me?.id ? IconFilePencil : IconFileText}
              title={page.title || t("Untitled")}
              detail={[page.space?.name, ago(page.updatedAt)].filter(Boolean).join(" · ")}
              to={buildPageUrl(page.space?.slug as string, page.slugId, page.title)}
            />
          ))}
        </HomeBlock>

        {/* 3 · Nouveau dans mes espaces */}
        <HomeBlock
          icon={IconSparkles}
          title={t("New in my spaces")}
          loading={recent.isLoading}
          isEmpty={news.length === 0}
          emptyText={t("Nothing new from your colleagues for now.")}
        >
          {news.slice(0, HOME_MAX_ROWS).map((page: any) => (
            <HomeRow
              key={page.id}
              icon={IconFileText}
              title={page.title || t("Untitled")}
              detail={[page.space?.name, page.lastUpdatedBy?.name, ago(page.updatedAt)].filter(Boolean).join(" · ")}
              to={buildPageUrl(page.space?.slug, page.slugId, page.title)}
            />
          ))}
        </HomeBlock>
      </SimpleGrid>

      {/* Mes espaces */}
      {spaceItems.length > 0 && (
        <Group gap="xs" wrap="wrap">
          <Text size="sm" fw={600} mr={4}>
            {t("My spaces")}
          </Text>
          {spaceItems.map((s) => (
            <Button key={s.id} size="compact-sm" variant="default" radius="xl" onClick={() => navigate(getSpaceUrl(s.slug))}>
              {s.name}
            </Button>
          ))}
          <Anchor size="xs" ml="auto" onClick={() => navigate("/spaces")}>
            {t("All spaces")}
          </Anchor>
        </Group>
      )}
    </Stack>
  );
}

function Kpi({ value, label, warn, small }: { value: string; label: string; warn?: boolean; small?: boolean }) {
  return (
    <Paper radius="sm" p="sm" withBorder>
      <Text fw={600} size={small ? "sm" : "lg"} c={warn ? "orange.7" : undefined} truncate>
        {value}
      </Text>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
    </Paper>
  );
}
