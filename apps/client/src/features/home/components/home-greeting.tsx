import { Stack, Text, Title } from "@mantine/core";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";

function greetingParts(
  now: Date,
  t: TFunction,
): { greeting: string; emoji: string } {
  const h = now.getHours();
  // Literal keys so the strings are extractable and translated.
  if (h < 12) return { greeting: t("Good morning"), emoji: "🌤️" };
  if (h < 18) return { greeting: t("Good afternoon"), emoji: "⛅" };
  return { greeting: t("Good evening"), emoji: "🌙" };
}

/**
 * Plane-style home greeting: centered "Good afternoon, <name>" with a
 * weekday/date/time line underneath — the same welcome header Plane shows.
 */
export default function HomeGreeting() {
  const { t, i18n } = useTranslation();
  const [currentUser] = useAtom(currentUserAtom);
  const name = currentUser?.user?.name || currentUser?.user?.email || "";

  const now = new Date();
  const { greeting, emoji } = greetingParts(now, t);
  const dateLine = now.toLocaleDateString(i18n.language || undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const timeLine = now.toLocaleTimeString(i18n.language || undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <Stack gap={4} align="center" mb="xl">
      <Title order={2} fw={600}>
        {greeting}, {name}
      </Title>
      <Text size="sm" c="dimmed" fw={500}>
        {emoji} {dateLine} {timeLine}
      </Text>
    </Stack>
  );
}
