import { useCallback } from "react";
import { useNavigate } from "react-router";
import DOMPurify from "dompurify";
import { ActionIcon, Tooltip } from "@mantine/core";
import {
  IconCheck,
  IconCopy,
  IconFile,
  IconLoader2,
  IconPhoto,
} from "@tabler/icons-react";
import { markdownToHtml } from "@docmost/editor-ext";
import { CopyButton } from "@/components/common/copy-button";
import type {
  AiChatMessage,
  AiChatSource,
  AiChatToolCall,
} from "../types/ai-chat.types";
import ChatToolGroup from "./chat-tool-group";
import ChatSources from "./chat-sources";
import classes from "../styles/chat-message.module.css";
import CopyTextButton from "@/components/common/copy.tsx";

const chatSanitizer = DOMPurify();
chatSanitizer.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName !== "A") return;
  const href = node.getAttribute("href") || "";

  // The model often links workspace pages with an absolute URL and guesses the
  // wrong host (e.g. conqrhub.com instead of app.conqrhub.com). Any link whose
  // path is an in-app page route (/s/... or /p/...) is rewritten to a relative
  // path so it navigates within the current app host via the router — never
  // bouncing to another domain. Host-agnostic, so it works for any deployment.
  try {
    const u = new URL(href, window.location.origin);
    if (u.pathname.startsWith("/s/") || u.pathname.startsWith("/p/")) {
      node.setAttribute("href", u.pathname + u.search + u.hash);
      node.removeAttribute("target");
      node.removeAttribute("rel");
      return;
    }
  } catch {
    // Not a parseable URL — fall through.
  }

  if (href.startsWith("http://") || href.startsWith("https://")) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "tiff", "tif"]);

type Props = {
  message: AiChatMessage;
  isStreaming?: boolean;
  streamingContent?: string;
  streamingToolCalls?: AiChatToolCall[];
};

export default function ChatMessage({
  message,
  isStreaming,
  streamingContent,
  streamingToolCalls,
}: Props) {
  const navigate = useNavigate();

  const handleContentClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (href && (href.startsWith("/s/") || href.startsWith("/p/"))) {
        e.preventDefault();
        navigate(href);
      }
    },
    [navigate],
  );

  if (message.role === "tool") return null;

  const isUser = message.role === "user";
  const content = isStreaming ? streamingContent : message.content;
  const toolCalls = isStreaming ? streamingToolCalls : message.toolCalls;

  if (isUser) {
    const displayContent = (content || "").replace(
      /\n\n<referenced_pages>[\s\S]*<\/referenced_pages>$/,
      "",
    );
    const attachments =
      (message.metadata?.attachments as {
        id: string;
        fileName: string;
        fileExt: string;
      }[]) || [];

    return (
      <div className={classes.userMessage}>
        <div className={classes.userBubble}>
          {attachments.length > 0 && (
            <div className={classes.messageAttachments}>
              {attachments.map((a) => (
                <span key={a.id} className={classes.messageAttachmentChip}>
                  {IMAGE_EXTENSIONS.has(a.fileExt) ? (
                    <IconPhoto size={13} />
                  ) : (
                    <IconFile size={13} />
                  )}
                  {a.fileName}
                </span>
              ))}
            </div>
          )}
          {displayContent}
        </div>
      </div>
    );
  }

  return (
    <div className={classes.assistantMessage}>
      <div className={classes.messageContent}>
        {toolCalls && toolCalls.length > 0 && (
          <ChatToolGroup toolCalls={toolCalls} isStreaming={isStreaming} />
        )}
        {content && (
          <div
            onClick={handleContentClick}
            dangerouslySetInnerHTML={{
              __html: chatSanitizer.sanitize(
                markdownToHtml(content) as string,
                { ADD_ATTR: ["target", "rel"] },
              ),
            }}
          />
        )}
        {isStreaming && (
          <>
            {!content && (
              <span className={classes.processingIndicator}>
                <IconLoader2 size={16} className={classes.processingSpinner} />
                Thinking
              </span>
            )}
            <span className={classes.streamingCursor} />
          </>
        )}
      </div>
      {!isStreaming && (
        <ChatSources
          sources={message.metadata?.sources as AiChatSource[] | undefined}
          confidence={message.metadata?.confidence as number | null | undefined}
          groundedSourceCount={
            message.metadata?.groundedSourceCount as number | undefined
          }
        />
      )}
      {!isStreaming && message.content && (
        <div className={classes.messageActions}>
          <CopyTextButton text={message?.content} />
        </div>
      )}
    </div>
  );
}
