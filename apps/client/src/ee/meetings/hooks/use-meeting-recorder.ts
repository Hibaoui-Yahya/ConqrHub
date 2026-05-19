import { useCallback, useEffect, useRef, useState } from "react";
import {
  startMeeting,
  stopMeeting,
  uploadMeetingChunk,
} from "../services/meeting-service";
import type { MeetingSource } from "../types/meeting.types";

const CHUNK_INTERVAL_MS = 30_000;
const MAX_MEETING_MS = 60 * 60 * 1000; // 1 hour hard cap (sanity).

export type RecorderState =
  | "idle"
  | "requesting"
  | "recording"
  | "stopping"
  | "completed"
  | "error";

interface LiveSegment {
  source: MeetingSource;
  text: string;
  startMs: number;
  sequence: number;
}

interface UseMeetingRecorderOptions {
  captureSystem: boolean;
  title?: string;
  onChunk?: (seg: LiveSegment) => void;
  onError?: (err: Error) => void;
  onCompleted?: (meetingId: string) => void;
}

interface StreamSlot {
  stream: MediaStream;
  recorder: MediaRecorder;
  sequence: number;
  chunkStartMs: number;
}

function pickAudioMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ]) {
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
  onChunk,
  onError,
  onCompleted,
}: UseMeetingRecorderOptions) {
  const [state, setState] = useState<RecorderState>("idle");
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const startedAtRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const meetingIdRef = useRef<string | null>(null);
  const micSlotRef = useRef<StreamSlot | null>(null);
  const sysSlotRef = useRef<StreamSlot | null>(null);
  // Tracks in-flight chunk uploads so stop() can wait for them.
  const pendingUploadsRef = useRef<Set<Promise<unknown>>>(new Set());
  const onChunkRef = useRef(onChunk);
  onChunkRef.current = onChunk;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onCompletedRef = useRef(onCompleted);
  onCompletedRef.current = onCompleted;

  const cleanupStream = (slot: StreamSlot | null) => {
    if (!slot) return;
    try {
      if (slot.recorder.state !== "inactive") slot.recorder.stop();
    } catch {
      // recorder might already be stopped
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

  const wireRecorder = (slot: StreamSlot, source: MeetingSource) => {
    slot.recorder.ondataavailable = (event) => {
      if (!event.data || event.data.size === 0) return;
      const seq = slot.sequence;
      const start = slot.chunkStartMs;
      const blob = event.data;
      slot.sequence += 1;
      slot.chunkStartMs += CHUNK_INTERVAL_MS;
      const mid = meetingIdRef.current;
      if (!mid) return;

      // Track the promise so stop() can await it. This is the
      // difference between "transcript missing the last sentence" and
      // "transcript includes the full meeting".
      const task = (async () => {
        try {
          const res = await uploadMeetingChunk(mid, blob, {
            source,
            sequence: seq,
            startMs: start,
            durationMs: CHUNK_INTERVAL_MS,
          });
          if (res.text) {
            onChunkRef.current?.({
              source,
              text: res.text,
              startMs: start,
              sequence: seq,
            });
          }
        } catch (err) {
          console.warn(
            `[meeting] chunk upload failed source=${source} seq=${seq}`,
            err,
          );
        }
      })();
      pendingUploadsRef.current.add(task);
      task.finally(() => pendingUploadsRef.current.delete(task));
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
          // Video required by the spec even if we only want audio; pause /
          // hide on the user side. Some browsers reject audio:true alone.
          video: true,
          audio: true,
        } as MediaStreamConstraints);

        const audioTracks = sysStream.getAudioTracks();
        if (audioTracks.length === 0) {
          // User shared a screen but did not tick "Share audio".
          for (const t of sysStream.getTracks()) t.stop();
          throw new Error(
            "No system audio. Re-share and check 'Share tab audio' or 'Share system audio'.",
          );
        }
        // Drop video tracks immediately to save bandwidth — we only
        // wanted audio. Video had to be requested to satisfy the API.
        for (const t of sysStream.getVideoTracks()) t.stop();
        sysStream = new MediaStream(audioTracks);
      }

      const startResp = await startMeeting(title);
      meetingIdRef.current = startResp.id;
      setMeetingId(startResp.id);

      const micRecorder = mime
        ? new MediaRecorder(micStream, { mimeType: mime })
        : new MediaRecorder(micStream);
      const micSlot: StreamSlot = {
        stream: micStream,
        recorder: micRecorder,
        sequence: 0,
        chunkStartMs: 0,
      };
      micSlotRef.current = micSlot;
      wireRecorder(micSlot, "mic");

      if (sysStream) {
        const sysRecorder = mime
          ? new MediaRecorder(sysStream, { mimeType: mime })
          : new MediaRecorder(sysStream);
        const sysSlot: StreamSlot = {
          stream: sysStream,
          recorder: sysRecorder,
          sequence: 0,
          chunkStartMs: 0,
        };
        sysSlotRef.current = sysSlot;
        wireRecorder(sysSlot, "system");
        sysRecorder.start(CHUNK_INTERVAL_MS);
      }

      micRecorder.start(CHUNK_INTERVAL_MS);

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
      meetingIdRef.current = null;
      setMeetingId(null);
      setState("error");
      onErrorRef.current?.(
        err instanceof Error ? err : new Error("Failed to start recording"),
      );
    }
  }, [captureSystem, state, title]);

  const stop = useCallback(async () => {
    if (state !== "recording" && state !== "requesting") return;
    setState("stopping");
    try {
      // Trigger one last dataavailable for any partial chunk.
      const flush = (slot: StreamSlot | null) =>
        new Promise<void>((resolve) => {
          if (!slot || slot.recorder.state === "inactive") {
            resolve();
            return;
          }
          slot.recorder.addEventListener("stop", () => resolve(), {
            once: true,
          });
          try {
            slot.recorder.stop();
          } catch {
            resolve();
          }
        });

      await Promise.all([flush(micSlotRef.current), flush(sysSlotRef.current)]);

      // Wait for every chunk upload (including the final one flushed
      // by recorder.stop) to complete. Without this, stopMeeting()
      // would assemble the transcript before the last chunk's segment
      // row exists in the DB and the user would lose the last 0-30s
      // of audio.
      while (pendingUploadsRef.current.size > 0) {
        await Promise.allSettled(Array.from(pendingUploadsRef.current));
      }

      const mid = meetingIdRef.current;
      if (!mid) throw new Error("No meeting in progress");
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

  useEffect(() => cleanupAll, [cleanupAll]);

  return {
    state,
    meetingId,
    elapsedMs,
    start,
    stop,
  };
}
