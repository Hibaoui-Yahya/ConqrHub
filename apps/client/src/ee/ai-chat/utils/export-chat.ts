import type { AiChatMessage, AiChatSource } from "../types/ai-chat.types";

type T = (key: string, options?: Record<string, unknown>) => string;

/** Markdown transcript of a conversation, with each answer's sources. */
export function chatToMarkdown(title: string, messages: AiChatMessage[], t: T): string {
  const lines: string[] = [`# ${title}`, ""];
  for (const m of messages) {
    if (m.role === "tool" || !m.content) continue;
    if (m.role === "user") {
      lines.push(`## ${t("Question")}`, "", m.content.trim(), "");
      continue;
    }
    lines.push(`## ${t("Answer")}`, "", m.content.trim(), "");
    const sources = (m.metadata?.sources as AiChatSource[] | undefined) ?? [];
    if (sources.length) {
      lines.push(`**${t("Sources")}**`, "");
      for (const s of sources) {
        const labels = (s.labels?.length ? s.labels : [s.label]).filter(Boolean).join(", ");
        const status = s.verified ? t("Verified") : t("Not verified");
        const link = s.slugId ? ` (/p/${s.slugId})` : "";
        lines.push(`- ${labels ? `[${labels}] ` : ""}${s.title || t("Untitled")}${link} · ${status}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

export function downloadChatAsMarkdown(title: string, messages: AiChatMessage[], t: T): void {
  const blob = new Blob([chatToMarkdown(title, messages, t)], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[\/:*?"<>|]+/g, " ").trim() || "conversation"}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
