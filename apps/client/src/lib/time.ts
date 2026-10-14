import { formatDistanceStrict } from "date-fns";
import { format, isToday, isYesterday } from "date-fns";
import { enUS, fr } from "date-fns/locale";
import i18n from "@/i18n.ts";

/** Dates follow the interface language, as in ConqrMeet (fr: 24 h clock). */
function isFrench(): boolean {
  return (i18n.language || "").toLowerCase().startsWith("fr");
}

export function timeAgo(date: Date) {
  return formatDistanceStrict(new Date(date), new Date(), {
    addSuffix: true,
    locale: isFrench() ? fr : enUS,
  });
}

export function formattedDate(date: Date) {
  const french = isFrench();
  const time = format(date, french ? "HH:mm" : "h:mma");
  if (isToday(date)) {
    return i18n.t("Today, {{time}}", { time });
  } else if (isYesterday(date)) {
    return i18n.t("Yesterday, {{time}}", { time });
  } else {
    return french
      ? format(date, "d MMM yyyy, HH:mm", { locale: fr })
      : format(date, "MMM dd, yyyy, h:mma");
  }
}
