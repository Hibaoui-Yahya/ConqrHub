import {
  useCallback,
  useRef,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useTranslation } from "react-i18next";
import {
  IconArrowUp,
  IconPaperclip,
  IconPlayerStopFilled,
  IconX,
  IconFile,
  IconPhoto,
  IconPlus,
  IconAt,
  IconFileText,
} from "@tabler/icons-react";
import { Popover } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import ChatScopeSelect, { SCOPE_ALL } from "./chat-scope-select";
import ChatModeToggle, { readStoredMode, storeMode } from "./chat-mode-toggle";
import { EditorContent, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import { Placeholder } from "@tiptap/extension-placeholder";
import { CharacterCount } from "@tiptap/extensions";
import { StarterKit } from "@tiptap/starter-kit";
import { Mention, LinkExtension } from "@docmost/editor-ext";
import EmojiCommand from "@/features/editor/extensions/emoji-command";
import mentionRenderItems from "@/features/editor/components/mention/mention-suggestion";
import MentionView from "@/features/editor/components/mention/mention-view";
import { uploadChatFile } from "../services/ai-chat-service";
import type {
  ChatAttachment,
  PageMention,
  SendMessageOptions,
  AiChatMode,
} from "../types/ai-chat.types";
import classes from "../styles/chat-input.module.css";
import { MicButton } from "@/ee/voice-input/mic-button";

type PendingAttachment = ChatAttachment & { uploading: boolean };

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "tiff", "tif"]);
const ACCEPTED_FILE_TYPES = ".pdf,.docx,.txt,.csv,.md";
// Kept in sync with MAX_ATTACHMENTS_PER_MESSAGE in apps/server/src/ee/ai-chat/ai-chat-limits.ts
const MAX_ATTACHMENTS_PER_MESSAGE = 5;

export type ChatInputHandle = {
  /** Insert text at the end of the composer and focus it (used by prompt suggestions). */
  insertText: (text: string) => void;
  /** Replace the composer content (used by "edit the question"). */
  setText: (text: string) => void;
  focus: () => void;
};

type Props = {
  isStreaming: boolean;
  onSend: (
    content: string,
    mentions: PageMention[],
    attachments: ChatAttachment[],
    options?: SendMessageOptions,
  ) => void;
  onStop: () => void;
  placeholder?: string;
  autofocus?: boolean;
  contextPages?: PageMention[];
  onRemoveContextPage?: (pageId: string) => void;
  variant?: "card" | "flat";
  showDisclaimer?: boolean;
  chatId?: string;
  /** Show the space-scope chip (full-page chat only). */
  showScope?: boolean;
};

function extractMentions(json: any): PageMention[] {
  const mentions: PageMention[] = [];
  const seen = new Set<string>();

  function walk(node: any) {
    if (node.type === "mention" && node.attrs?.entityType === "page" && node.attrs?.entityId) {
      if (!seen.has(node.attrs.entityId)) {
        seen.add(node.attrs.entityId);
        mentions.push({
          id: node.attrs.entityId,
          title: node.attrs.label || "",
          slugId: node.attrs.slugId || "",
        });
      }
    }
    if (node.content) {
      for (const child of node.content) {
        walk(child);
      }
    }
  }

  walk(json);
  return mentions;
}

function editorJsonToText(json: any): string {
  let text = "";

  function walk(node: any) {
    if (node.type === "text") {
      text += node.text || "";
    } else if (node.type === "mention") {
      text += `@${node.attrs?.label || ""}`;
    } else if (node.type === "paragraph") {
      if (text.length > 0) text += "\n";
      if (node.content) {
        for (const child of node.content) {
          walk(child);
        }
      }
      return;
    }
    if (node.content) {
      for (const child of node.content) {
        walk(child);
      }
    }
  }

  walk(json);
  return text;
}

const ChatInput = forwardRef<ChatInputHandle, Props>(function ChatInput(
  {
    isStreaming,
    onSend,
    onStop,
    placeholder,
    autofocus = true,
    contextPages,
    onRemoveContextPage,
    variant = "card",
    showDisclaimer = true,
    chatId,
    showScope = false,
  }: Props,
  ref,
) {
  const chatIdRef = useRef(chatId);
  chatIdRef.current = chatId;
  const { t } = useTranslation();
  const [isEmpty, setIsEmpty] = useState(true);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [scopeSpaceId, setScopeSpaceId] = useState<string>(SCOPE_ALL);
  const scopeSpaceIdRef = useRef(scopeSpaceId);
  scopeSpaceIdRef.current = scopeSpaceId;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;

  const scopeEnabled = showScope && variant === "card";
  const [mode, setMode] = useState<AiChatMode>(readStoredMode);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const changeMode = useCallback((next: AiChatMode) => {
    setMode(next);
    storeMode(next);
  }, []);
  // The placeholder is read lazily so it follows the language once the
  // translations finish loading (the editor is created only once).
  const placeholderRef = useRef("");
  placeholderRef.current = placeholder || t("Ask anything... Use @ to mention pages");

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;

    const room = MAX_ATTACHMENTS_PER_MESSAGE - pendingAttachments.length;
    if (room <= 0) {
      notifications.show({
        color: "yellow",
        message: t("You can attach up to {{max}} files per message.", {
          max: MAX_ATTACHMENTS_PER_MESSAGE,
        }),
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const incoming = Array.from(files);

    const imageFiles = incoming.filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase() || "";
      return IMAGE_EXTENSIONS.has(ext);
    });

    if (imageFiles.length > 0) {
      notifications.show({
        color: "red",
        title: t("Images not supported"),
        message: t(
          imageFiles.length === 1
            ? "{{name}} cannot be uploaded — this AI model does not support image input."
            : "{{count}} image files were skipped — this AI model does not support image input.",
          { name: imageFiles[0].name, count: imageFiles.length },
        ),
      });
    }

    const nonImageFiles = incoming.filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase() || "";
      return !IMAGE_EXTENSIONS.has(ext);
    });

    if (nonImageFiles.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const accepted = nonImageFiles.slice(0, room);

    if (nonImageFiles.length > accepted.length) {
      notifications.show({
        color: "yellow",
        message: t(
          "Only the first {{n}} file(s) were added (max {{max}} per message).",
          { n: accepted.length, max: MAX_ATTACHMENTS_PER_MESSAGE },
        ),
      });
    }

    for (const file of accepted) {
      const tempId = `uploading-${Date.now()}-${Math.random()}`;
      const ext = file.name.split(".").pop()?.toLowerCase() || "";

      const placeholder: PendingAttachment = {
        id: tempId,
        fileName: file.name,
        fileExt: ext,
        fileSize: file.size,
        mimeType: file.type,
        uploading: true,
      };

      setPendingAttachments((prev) => [...prev, placeholder]);

      try {
        const uploaded = await uploadChatFile(file, chatIdRef.current);
        setPendingAttachments((prev) =>
          prev.map((a) =>
            a.id === tempId ? { ...uploaded, uploading: false } : a,
          ),
        );
      } catch {
        setPendingAttachments((prev) => prev.filter((a) => a.id !== tempId));
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [pendingAttachments.length, t]);

  const removeAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleSubmit = useCallback(() => {
    if (!editor || isStreaming) return;
    const json = editor.getJSON();
    const text = editorJsonToText(json).trim();
    const readyAttachments = pendingAttachments.filter((a) => !a.uploading);
    if (!text && readyAttachments.length === 0) return;

    const mentions = extractMentions(json);
    const scope = scopeSpaceIdRef.current;
    const options: SendMessageOptions = {
      ...(scopeEnabled && scope && scope !== SCOPE_ALL ? { spaceId: scope } : {}),
      ...(scopeEnabled && modeRef.current === "deep" ? { mode: "deep" as const } : {}),
    };
    onSendRef.current(text, mentions, readyAttachments, options);
    editor.commands.clearContent();
    editor.commands.focus();
    setPendingAttachments([]);
  }, [isStreaming, pendingAttachments, scopeEnabled]);

  const handleSubmitRef = useRef(handleSubmit);
  handleSubmitRef.current = handleSubmit;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        gapcursor: false,
        dropcursor: false,
        link: false,
      }),
      Placeholder.configure({
        placeholder: () => placeholderRef.current,
      }),
      CharacterCount.configure({
        limit: 50000,
      }),
      LinkExtension,
      EmojiCommand,
      Mention.configure({
        suggestion: {
          allowSpaces: true,
          items: () => [],
          // @ts-ignore
          render: mentionRenderItems,
        },
        HTMLAttributes: {
          class: "mention",
        },
      }).extend({
        addNodeView() {
          this.editor.isInitialized = true;
          return ReactNodeViewRenderer(MentionView);
        },
      }),
    ],
    editorProps: {
      handleDOMEvents: {
        keydown: (_view, event) => {
          if (
            ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(
              event.key,
            )
          ) {
            const emojiCommand = document.querySelector("#emoji-command");
            const mentionPopup = document.querySelector("#mention");
            if (emojiCommand || mentionPopup) {
              return true;
            }
          }

          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            handleSubmitRef.current();
            return true;
          }
        },
      },
    },
    content: "",
    editable: true,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    autofocus: autofocus ? "end" : false,
    onUpdate: ({ editor: e }) => {
      setIsEmpty(!e.getText().trim());
    },
  });

  useEffect(() => {
    if (editor && autofocus) {
      editor.commands.focus();
    }
  }, [editor]);

  useImperativeHandle(
    ref,
    () => ({
      insertText: (text: string) => {
        if (!editor) return;
        editor.commands.focus("end");
        editor.commands.insertContent(text);
        editor.commands.focus("end");
        setIsEmpty(!editor.getText().trim());
      },
      setText: (text: string) => {
        if (!editor) return;
        editor.commands.setContent(
          text
            .split("\n")
            .map((line) => `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`)
            .join(""),
        );
        editor.commands.focus("end");
        setIsEmpty(!editor.getText().trim());
      },
      focus: () => editor?.commands.focus("end"),
    }),
    [editor],
  );

  const hasContent = !isEmpty || pendingAttachments.some((a) => !a.uploading) || (contextPages?.length ?? 0) > 0;

  const wrapperClass = variant === "flat" ? classes.inputWrapperFlat : classes.inputWrapper;

  return (
    <>
    <div className={wrapperClass} data-chat-input>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        multiple
        style={{ display: "none" }}
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      {((contextPages?.length ?? 0) > 0 || pendingAttachments.length > 0) && (
        <div className={classes.attachmentChips}>
          {contextPages?.map((page) => (
            <div key={page.id} className={classes.attachmentChip}>
              <IconFileText size={14} />
              <span className={classes.attachmentChipName}>
                {page.title || t("Untitled")}
              </span>
              {onRemoveContextPage && (
                <button
                  type="button"
                  className={classes.attachmentChipRemove}
                  onClick={() => onRemoveContextPage(page.id)}
                  aria-label={t("Remove {{name}}", { name: page.title })}
                >
                  <IconX size={12} />
                </button>
              )}
            </div>
          ))}
          {pendingAttachments.map((attachment) => (
            <div
              key={attachment.id}
              className={`${classes.attachmentChip} ${attachment.uploading ? classes.attachmentChipUploading : ""}`}
            >
              {IMAGE_EXTENSIONS.has(attachment.fileExt) ? (
                <IconPhoto size={14} />
              ) : (
                <IconFile size={14} />
              )}
              <span className={classes.attachmentChipName}>
                {attachment.fileName}
              </span>
              {!attachment.uploading && (
                <button
                  type="button"
                  className={classes.attachmentChipRemove}
                  onClick={() => removeAttachment(attachment.id)}
                  aria-label={t("Remove {{name}}", { name: attachment.fileName })}
                >
                  <IconX size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <EditorContent editor={editor} className={classes.editorContent} />
      <div className={classes.actions}>
        <Popover opened={plusMenuOpen} onChange={setPlusMenuOpen} position="top-start" width={220} shadow="md">
          <Popover.Target>
            <button
              type="button"
              className={classes.plusButton}
              onClick={() => setPlusMenuOpen((o) => !o)}
              aria-label={t("Add content")}
            >
              <IconPlus size={14} />
            </button>
          </Popover.Target>
          <Popover.Dropdown p={4}>
            <button
              type="button"
              className={classes.plusMenuItem}
              onClick={() => {
                fileInputRef.current?.click();
                setPlusMenuOpen(false);
              }}
              disabled={pendingAttachments.length >= MAX_ATTACHMENTS_PER_MESSAGE}
              title={
                pendingAttachments.length >= MAX_ATTACHMENTS_PER_MESSAGE
                  ? t("Max {{max}} files per message", {
                      max: MAX_ATTACHMENTS_PER_MESSAGE,
                    })
                  : undefined
              }
            >
              <IconPaperclip size={16} className={classes.plusMenuIcon} />
              {t("Add files")}
            </button>
            <button
              type="button"
              className={classes.plusMenuItem}
              onClick={() => {
                editor?.commands.insertContent("@");
                editor?.commands.focus();
                setPlusMenuOpen(false);
              }}
            >
              <IconAt size={16} className={classes.plusMenuIcon} />
              {t("Mention a page")}
            </button>
          </Popover.Dropdown>
        </Popover>

        <MicButton
          context={{
            kind: "chat",
            chatId: chatIdRef.current,
            mentionPageIds: contextPages?.map((p) => p.id),
          }}
          onTranscript={(text) => {
            if (!editor) return;
            const hasText = !editor.isEmpty;
            editor.commands.insertContent(hasText ? ` ${text}` : text);
            editor.commands.focus("end");
          }}
        />

        {scopeEnabled && (
          <ChatScopeSelect value={scopeSpaceId} onChange={setScopeSpaceId} />
        )}

        {scopeEnabled && <ChatModeToggle value={mode} onChange={changeMode} />}

        <div style={{ flex: 1 }} />

        {isStreaming ? (
          <button
            type="button"
            className={classes.stopButton}
            onClick={onStop}
            aria-label={t("Stop generation")}
          >
            <IconPlayerStopFilled size={14} />
          </button>
        ) : (
          <button
            type="button"
            className={classes.sendButton}
            onClick={handleSubmit}
            disabled={!hasContent}
            aria-label={t("Send message")}
          >
            <IconArrowUp size={16} stroke={2.5} />
          </button>
        )}
      </div>
    </div>
    {showDisclaimer && (
      <div className={classes.disclaimer}>
        {t("AI-generated content may not be accurate.")}
      </div>
    )}
    </>
  );
});

export default ChatInput;
