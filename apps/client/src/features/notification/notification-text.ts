import type { TFunction } from "i18next";
import type { INotification } from "./types/notification.types";
import { getSuiteAppUrls } from "@/lib/config.ts";

/** Plain title/detail for the meeting notifications (toasts and the bell). */
export function notificationText(
  n: INotification,
  t: TFunction,
): { title: string; detail?: string; color: string; href?: string } {
  const data = (n.data ?? {}) as {
    meetingId?: string;
    meetingTitle?: string;
    reason?: string | null;
  };
  const meet = getSuiteAppUrls().meet;
  const meetingHref =
    meet && data.meetingId ? `${meet}/meetings/${data.meetingId}` : undefined;
  const title = data.meetingTitle || t("Untitled meeting");
  switch (n.type) {
    case "meeting.ready":
      return {
        title: t("Meeting ready: {{title}}", { title }),
        detail: t("Transcript, report and evaluation are available."),
        color: "teal",
        href: meetingHref,
      };
    case "meeting.failed":
      return {
        title: t("Processing failed: {{title}}", { title }),
        detail: data.reason
          ? t("Reason: {{reason}}", { reason: data.reason })
          : t("Open the meeting to retry or import the recording again."),
        color: "red",
        href: meetingHref,
      };
    case "meeting.review_needed":
      return {
        title: t("Speakers to confirm: {{title}}", { title }),
        detail: t("The AI suggests names; your confirmation is needed."),
        color: "yellow",
        href: meetingHref,
      };
    case "meeting.published":
      return {
        title: t("Report published in ConqrHub: {{title}}", { title }),
        detail: n.page?.title,
        color: "teal",
      };
    default:
      return {
        title: n.actor?.name
          ? t("{{name}} sent you a notification", { name: n.actor.name })
          : t("New notification"),
        detail: n.page?.title,
        color: "blue",
      };
  }
}

export function isMeetingNotification(type: string): boolean {
  return type.startsWith("meeting.");
}
