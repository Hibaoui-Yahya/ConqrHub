import { useEffect, useState } from "react";
import { ActionIcon, Button, Group, Popover, Textarea, Tooltip } from "@mantine/core";
import { IconThumbDown, IconThumbUp } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { sendFeedback } from "../services/ai-chat-service";
import type { AiChatFeedback, AiChatFeedbackRating } from "../types/ai-chat.types";
import classes from "../styles/chat-message.module.css";

type Props = {
  messageId: string;
  feedback?: AiChatFeedback | null;
  onChange?: (messageId: string, feedback: AiChatFeedback | null) => void;
};

/**
 * Thumbs up / down for an assistant message. The rating is applied
 * optimistically; a "down" opens a small popover asking what went wrong.
 */
export default function ChatFeedback({ messageId, feedback, onChange }: Props) {
  const { t } = useTranslation();
  const [rating, setRating] = useState<AiChatFeedbackRating | null>(
    feedback?.rating ?? null,
  );
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setRating(feedback?.rating ?? null);
  }, [feedback?.rating]);

  const submit = async (next: AiChatFeedbackRating, text?: string) => {
    const previous = rating;
    setRating(next);
    onChange?.(messageId, { rating: next, ...(text ? { comment: text } : {}) });
    try {
      setSending(true);
      await sendFeedback({
        messageId,
        rating: next,
        ...(text ? { comment: text } : {}),
      });
    } catch {
      // Roll back the optimistic state; the server did not record it.
      setRating(previous);
      onChange?.(messageId, previous ? { rating: previous } : null);
    } finally {
      setSending(false);
    }
  };

  const handleUp = () => {
    if (rating === "up") return;
    setCommentOpen(false);
    void submit("up");
  };

  const handleDown = () => {
    if (rating !== "down") {
      void submit("down");
    }
    setCommentOpen(true);
  };

  const handleSendComment = async () => {
    const text = comment.trim();
    await submit("down", text || undefined);
    setCommentOpen(false);
    setComment("");
  };

  return (
    <>
      <Tooltip label={t("Helpful")} withArrow openDelay={300}>
        <ActionIcon
          variant="subtle"
          color={rating === "up" ? undefined : "gray"}
          className={rating === "up" ? classes.feedbackActive : undefined}
          onClick={handleUp}
          aria-label={t("Helpful")}
          aria-pressed={rating === "up"}
          disabled={sending}
        >
          <IconThumbUp size={16} />
        </ActionIcon>
      </Tooltip>

      <Popover
        opened={commentOpen}
        onChange={setCommentOpen}
        position="top-start"
        width={300}
        shadow="md"
        withArrow
        trapFocus
      >
        <Popover.Target>
          <Tooltip label={t("Not helpful")} withArrow openDelay={300}>
            <ActionIcon
              variant="subtle"
              color={rating === "down" ? undefined : "gray"}
              className={rating === "down" ? classes.feedbackActive : undefined}
              onClick={handleDown}
              aria-label={t("Not helpful")}
              aria-pressed={rating === "down"}
              disabled={sending}
            >
              <IconThumbDown size={16} />
            </ActionIcon>
          </Tooltip>
        </Popover.Target>
        <Popover.Dropdown p="sm">
          <Textarea
            size="xs"
            autosize
            minRows={2}
            maxRows={5}
            label={t("What went wrong?")}
            placeholder={t("Optional comment")}
            value={comment}
            onChange={(e) => setComment(e.currentTarget.value)}
            data-autofocus
          />
          <Group justify="flex-end" gap="xs" mt="xs">
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              onClick={() => setCommentOpen(false)}
            >
              {t("Cancel")}
            </Button>
            <Button
              size="compact-xs"
              onClick={handleSendComment}
              loading={sending}
            >
              {t("Send")}
            </Button>
          </Group>
        </Popover.Dropdown>
      </Popover>
    </>
  );
}
