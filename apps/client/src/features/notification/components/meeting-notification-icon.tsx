import { ThemeIcon } from "@mantine/core";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconFileCheck,
  IconUsers,
} from "@tabler/icons-react";

/** Category tile of a ConqrMeet notification: icon + colour carry meaning. */
export function MeetingNotificationIcon({ type }: { type: string }) {
  const [Icon, color] =
    type === "meeting.failed"
      ? [IconAlertTriangle, "red"]
      : type === "meeting.review_needed"
        ? [IconUsers, "yellow"]
        : type === "meeting.published"
          ? [IconFileCheck, "teal"]
          : [IconCircleCheck, "teal"];
  return (
    <ThemeIcon variant="light" color={color} radius="md" size={30}>
      <Icon size={17} stroke={1.8} />
    </ThemeIcon>
  );
}
