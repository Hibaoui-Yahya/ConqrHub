import { useCallback, useEffect, useRef, useState } from "react";
import type { RecordingState } from "./types";

const MAX_DURATION_MS = 60_000;

interface Options {
  onComplete: (blob: Blob, mime: string) => void;
  onError?: (err: Error) => void;
  onAutoStop?: () => void;
}

export function useVoiceInput({ onComplete, onError, onAutoStop }: Options) {
  const [state, setState] = useState<RecordingState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  const cleanup = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (autoStopRef.current !== null) {
      window.clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const start = useCallback(async () => {
    if (state !== "idle") return;
    cancelledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, {
        mimeType: mime,
        audioBitsPerSecond: 64000,
      });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const wasCancelled = cancelledRef.current;
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        cleanup();
        setElapsedMs(0);
        if (wasCancelled || blob.size === 0) {
          setState("idle");
          return;
        }
        setState("transcribing");
        onComplete(blob, "audio/webm");
      };

      startedAtRef.current = Date.now();
      recorder.start();
      setState("recording");
      tickRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 200);
      autoStopRef.current = window.setTimeout(() => {
        onAutoStop?.();
        try {
          recorder.stop();
        } catch {
          // Recorder may already be stopped; ignore.
        }
      }, MAX_DURATION_MS);
    } catch (err) {
      cleanup();
      setState("idle");
      onError?.(err instanceof Error ? err : new Error("Recording failed"));
    }
  }, [state, onComplete, onError, onAutoStop, cleanup]);

  const stop = useCallback(() => {
    const r = recorderRef.current;
    if (!r || state !== "recording") return;
    try {
      r.stop();
    } catch {
      // Recorder may already be stopped; ignore.
    }
  }, [state]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    const r = recorderRef.current;
    if (r && r.state !== "inactive") {
      try {
        r.stop();
      } catch {
        // Recorder may already be stopped; ignore.
      }
    } else {
      cleanup();
      setState("idle");
      setElapsedMs(0);
    }
  }, [cleanup]);

  const finishTranscribing = useCallback(() => setState("idle"), []);

  useEffect(() => cleanup, [cleanup]);

  return { state, elapsedMs, start, stop, cancel, finishTranscribing };
}

export function isVoiceInputSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  );
}
