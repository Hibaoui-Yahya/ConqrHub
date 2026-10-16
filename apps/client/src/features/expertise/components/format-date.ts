import i18n from "@/i18n";

/** "16 oct. 2026" in the interface language. */
export function formatDateFr(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(i18n.language || "fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
