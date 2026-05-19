import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteMeeting,
  startMeeting,
  stopMeeting,
  uploadMeetingChunk,
} from "../services/meeting-service";
import type { MeetingSource } from "../types/meeting.types";

const MAX_MEETING_MS = 60 * 60 * 1000; // 1 hour hard cap.
// Mistral's audio_transcriptions endpoint rejects chunked WebM
// because only the first chunk has the EBML header. We record the
// entire session as one continuous Blob in memory and upload it once
// on stop. At ~64kbps this is roughly 28 MB per hour per stream,
// which fits comfortably in browser memory.
const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
];

export type RecorderState =
  | "idle"
  | "requesting"
  | "recording"
  | "uploading"
  | "completed"
  | "error";

interface UseMeetingRecorderOptions {
  captureSystem: boolean;
  title?: string;
  onError?: (err: Error) => void;
  onCompleted?: (meetingId: string) => void;
  onCancelled?: () => void;
}

interface StreamSlot {
  stream: MediaStream;
  recorder: MediaRecorder;
  chunks: Blob[];
  mime: string;
}

function pickAudioMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

export function isSystemAudioSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof (navigator.mediaDevices as any).getDisplayMedia === "function"
  );
}

export function useMeetingRecorder({
  captureSystem,
  title,
  onError,
  onCompleted,
  onCancelled,
}: UseMeetingRecorderOptions) {
  const [state, setState] = useState<RecorderState>("idle");
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const startedAtRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const meetingIdRef = useRef<string | null>(null);
  const micSlotRef = useRef<StreamSlot | null>(null);
  const sysSlotRef = useRef<StreamSlot | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onCompletedRef = useRef(onCompleted);
  onCompletedRef.current = onCompleted;
  const onCancelledRef = useRef(onCancelled);
  onCancelledRef.current = onCancelled;

  const cleanupStream = (slot: StreamSlot | null) => {
    if (!slot) return;
    try {
      if (slot.recorder.state !== "inactive") slot.recorder.stop();
    } catch {
      // already stopped
    }
    for (const t of slot.stream.getTracks()) t.stop();
  };

  const cleanupAll = useCallback(() => {
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    cleanupStream(micSlotRef.current);
    cleanupStream(sysSlotRef.current);
    micSlotRef.current = null;
    sysSlotRef.current = null;
  }, []);

  const wireRecorder = (slot: StreamSlot) => {
    slot.recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        slot.chunks.push(event.data);
      }
    };
  };

  const start = useCallback(async () => {
    if (state !== "idle" && state !== "error" && state !== "completed") return;
    if (typeof MediaRecorder === "undefined") {
      onErrorRef.current?.(new Error("MediaRecorder not supported"));
      return;
    }
    setState("requesting");
    try {
      const mime = pickAudioMime();
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      let sysStream: MediaStream | null = null;
      if (captureSystem) {
        if (!isSystemAudioSupported()) {
          throw new Error("System audio capture not supported in this browser");
        }
        sysStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        } as MediaStreamConstraints);

        const audioTracks = sysStream.getAudioTracks();
        if (audioTracks.length === 0) {
          for (const t of sysStream.getTracks()) t.stop();
          throw new Error(
            "No system audio. Re-share and check 'Share tab audio' or 'Share system audio'.",
          );
        }
        for (const t of sysStream.getVideoTracks()) t.stop();
        sysStream = new MediaStream(audioTracks);
      }

      const startResp = await startMeeting(title);
      meetingIdRef.current = startResp.id;
      setMeetingId(startResp.id);

      const buildSlot = (stream: MediaStream): StreamSlot => {
        const recorder = mime
          ? new MediaRecorder(stream, { mimeType: mime })
          : new MediaRecorder(stream);
        const slot: StreamSlot = {
          stream,
          recorder,
          chunks: [],
          mime: recorder.mimeType || mime || "audio/webm",
        };
        wireRecorder(slot);
        // NO timeslice argument — keeps the WebM container valid as a
        // single continuous stream. ondataavailable fires once on
        // recorder.stop().
        recorder.start();
        return slot;
      };

      micSlotRef.current = buildSlot(micStream);
      if (sysStream) sysSlotRef.current = buildSlot(sysStream);

      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setState("recording");
      tickRef.current = window.setInterval(() => {
        const el = Date.now() - startedAtRef.current;
        setElapsedMs(el);
        if (el >= MAX_MEETING_MS) {
          stop();
        }
      }, 500);
    } catch (err) {
      cleanupAll();
      const orphan = meetingIdRef.current;
      meetingIdRef.current = null;
      setMeetingId(null);
      if (orphan) {
        deleteMeeting(orphan).catch(() => {
          /* best-effort cleanup */
        });
      }
      setState("error");
      onErrorRef.current?.(
        err instanceof Error ? err : new Error("Failed to start recording"),
      );
    }
  }, [captureSystem, state, title]);

  const stop = useCallback(async () => {
    if (state !== "recording" && state !== "requesting") return;
    setState("uploading");
    try {
      const totalDurationMs = Date.now() - startedAtRef.current;

      // Stop both recorders and wait for the final ondataavailable
      // (no timeslice means there's exactly one ondataavailable event
      // per recorder, fired when stop() is called).
      const flush = (slot: StreamSlot | null) =>
        new Promise<void>((resolve) => {
          if (!slot || slot.recorder.state === "inactive") {
            resolve();
            return;
          }
          slot.recorder.addEventListener(
            "stop",
            () => {
              resolve();
            },
            { once: true },
          );
          try {
            slot.recorder.stop();
          } catch {
            resolve();
          }
        });
      await Promise.all([flush(micSlotRef.current), flush(sysSlotRef.current)]);

      const mid = meetingIdRef.current;
      if (!mid) throw new Error("No meeting in progress");

      const uploadSlot = async (
        slot: StreamSlot | null,
        source: MeetingSource,
      ) => {
        if (!slot || slot.chunks.length === 0) return;
        const blob = new Blob(slot.chunks, { type: slot.mime });
        if (blob.size === 0) return;
        await uploadMeetingChunk(mid, blob, {
          source,
          sequence: 0,
          startMs: 0,
          durationMs: totalDurationMs,
        });
      };

      await Promise.all([
        uploadSlot(micSlotRef.current, "mic"),
        uploadSlot(sysSlotRef.current, "system"),
      ]);

      await stopMeeting(mid);
      cleanupAll();
      setState("completed");
      onCompletedRef.current?.(mid);
    } catch (err) {
      cleanupAll();
      setState("error");
      onErrorRef.current?.(
        err instanceof Error ? err : new Error("Failed to stop recording"),
      );
    }
  }, [cleanupAll, state]);

  const cancel = useCallback(async () => {
    if (state !== "recording" && state !== "requesting") return;
    const mid = meetingIdRef.current;
    setState("uploading");
    cleanupAll();
    meetingIdRef.current = null;
    setMeetingId(null);
    setElapsedMs(0);
    if (mid) {
      try {
        await deleteMeeting(mid);
      } catch {
        // best-effort
      }
    }
    setState("idle");
    onCancelledRef.current?.();
  }, [cleanupAll, state]);

  useEffect(() => cleanupAll, [cleanupAll]);

  return {
    state,
    meetingId,
    elapsedMs,
    start,
    stop,
    cancel,
  };
}
