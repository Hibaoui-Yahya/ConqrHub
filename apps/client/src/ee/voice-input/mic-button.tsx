import { useCallback, useMemo } from "react";
import { IconMicrophone, IconX, IconLoader2 } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";
import { useVoiceInput, isVoiceInputSupported } from "./use-voice-input";
import { transcribeAudio } from "./stt-service";
import type { SttContext } from "./types";
import classes from "./mic-button.module.css";

interface Props {
  context: SttContext;
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MicButton({
  context,
  onTranscript,
  disabled,
  className,
  compact,
}: Props) {
  const { t } = useTranslation();
  const hasAi = useHasFeature(Feature.AI);
  const workspace = useAtomValue(workspaceAtom);
  const sttEnabled = workspace?.settings?.ai?.stt ?? true;
  const supported = useMemo(() => isVoiceInputSupported(), []);

  const { state, elapsedMs, start, stop, cancel, finishTranscribing } =
    useVoiceInput({
      onComplete: async (blob) => {
        try {
          const result = await transcribeAudio(blob, context);
          const text = (result.corrected || result.raw || "").trim();
          if (text) {
            onTranscript(text);
          } else {
            notifications.show({
              color: "yellow",
              message: t("No speech detected."),
            });
          }
        } catch (err: any) {
          notifications.show({
            color: "red",
            title: t("Transcription failed"),
            message:
              err?.response?.data?.message ?? t("Please try again."),
          });
        } finally {
          finishTranscribing();
        }
      },
      onError: useCallback(
        (err: Error) => {
          const isPerm =
            err.name === "NotAllowedError" ||
            err.message.includes("Permission");
          notifications.show({
            color: "red",
            title: isPerm
              ? t("Microphone access denied")
              : t("Recording failed"),
            message: isPerm
              ? t("Enable microphone access in your browser settings.")
              : err.message,
          });
        },
        [t],
      ),
      onAutoStop: useCallback(() => {
        notifications.show({
          color: "yellow",
          message: t("Recording stopped at 60-second limit."),
        });
      }, [t]),
    });

  if (!hasAi || !sttEnabled || !supported) return null;

  const baseClass = compact
    ? `${classes.button} ${classes.compact}`
    : classes.button;

  if (state === "recording") {
    return (
      <div className={`${classes.group} ${className ?? ""}`}>
        <button
          type="button"
          className={`${baseClass} ${classes.recording}`}
          onClick={stop}
          aria-label={t("Stop recording")}
        >
          <span className={classes.dot} />
          {!compact && (
            <span className={classes.timer}>{formatElapsed(elapsedMs)}</span>
          )}
        </button>
        <button
          type="button"
          className={baseClass}
          onClick={cancel}
          aria-label={t("Cancel recording")}
        >
          <IconX size={14} />
        </button>
      </div>
    );
  }

  if (state === "transcribing") {
    return (
      <button
        type="button"
        className={`${baseClass} ${classes.transcribing} ${className ?? ""}`}
        disabled
        aria-label={t("Transcribing")}
      >
        <IconLoader2 size={14} />
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`${baseClass} ${className ?? ""}`}
      onClick={start}
      disabled={disabled}
      aria-label={t("Record voice")}
      title={t("Record voice")}
    >
      <IconMicrophone size={14} />
    </button>
  );
}
