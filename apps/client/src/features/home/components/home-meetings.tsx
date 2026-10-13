import { useEffect, useState } from "react";
import {
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Skeleton,
  Stack,
  Text,
} from "@mantine/core";
import { IconExternalLink, IconMicrophone } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api-client";

/** ConqrMeet base URL, same resolution as the app switcher. */
const MEET_URL =
  process.env.MEET_APP_URL ||
  (import.meta as any)?.env?.VITE_MEET_URL ||
  (import.meta.env.DEV ? "http://localhost:5273" : "");

interface HomeMeeting {
  id: string;
  title: string;
  status: string;
  startedAt: string;
  settings?: { publishedBundle?: { meetingPageId?: string } } | null;
}

const AWAITING = new Set(["awaiting_review", "speakers_pending_review"]);

/**
 * "Réunions" on the Hub home: what ConqrMeet recorded, what waits for a
 * review in Meet, and the Hub page of each meeting already published.
 * Hidden when the meeting engine is not available to this user.
 */
export default function HomeMeetings() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<HomeMeeting[] | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const load = () =>
      api
        .get("/ai/meeting", { params: { limit: 6 } })
        .then((res: any) => {
          const body = res?.data ?? res;
          setItems(Array.isArray(body) ? body : (body?.items ?? []));
        })
        .catch(() => setHidden(true));
    load();
    // Back from ConqrMeet (a recording reviewed or published) → fresh list.
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  if (hidden) return null;

  const awaiting = (items ?? []).filter((m) => AWAITING.has(m.status));

  return (
    <Card withBorder padding="lg" radius="md">
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <IconMicrophone size={18} color="var(--brand-default)" />
          <Text fw={600}>{t("Recent meetings")}</Text>
          {awaiting.length > 0 && (
            <Badge color="yellow" variant="light">
              {t("{{count}} to review", { count: awaiting.length })}
            </Badge>
          )}
        </Group>
        {MEET_URL && (
          <Button
            component="a"
            href={`${MEET_URL}/meetings?record=1`}
            size="xs"
            leftSection={<IconMicrophone size={14} />}
          >
            {t("Record an interview")}
          </Button>
        )}
      </Group>

      {items === null && <Skeleton height={64} />}
      {items !== null && items.length === 0 && (
        <Text size="sm" c="dimmed">
          {t(
            "Meetings recorded in ConqrMeet appear here. Once published, their report and transcript are filed in a space.",
          )}
        </Text>
      )}

      <Stack gap={0}>
        {(items ?? []).map((m) => {
          const pageId = m.settings?.publishedBundle?.meetingPageId;
          const date = new Date(m.startedAt).toLocaleDateString(i18n.language, {
            day: "numeric",
            month: "short",
          });
          return (
            <Group
              key={m.id}
              justify="space-between"
              wrap="nowrap"
              py={10}
              style={{ borderTop: "0.5px solid var(--border-subtle)" }}
            >
              <div style={{ minWidth: 0 }}>
                <Text size="sm" fw={500} truncate>
                  {m.title}
                </Text>
                <Text size="xs" c="dimmed">
                  {date}
                  {AWAITING.has(m.status) ? ` · ${t("To review in ConqrMeet")}` : ""}
                </Text>
              </div>
              {pageId ? (
                <Anchor component={Link} to={`/p/${pageId}`} size="sm">
                  {t("Open the page")}
                </Anchor>
              ) : (
                MEET_URL && (
                  <Anchor
                    href={`${MEET_URL}/meetings/${m.id}`}
                    target="_blank"
                    rel="noreferrer"
                    size="sm"
                  >
                    <Group gap={4} wrap="nowrap">
                      {t("Open in ConqrMeet")}
                      <IconExternalLink size={12} />
                    </Group>
                  </Anchor>
                )
              )}
            </Group>
          );
        })}
      </Stack>
    </Card>
  );
}
