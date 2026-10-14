/**
 * Suite notification sounds. Same file in ConqrHub and ConqrMeet so both
 * apps sound the same. Sounds are synthesised with WebAudio (no audio files
 * to host), last under a second, and an event never sounds twice even with
 * several tabs open.
 */

export type SoundName = "clair" | "doux" | "alerte" | "discret" | "aucun";
export type NotificationCategory =
  | "ready"
  | "problem"
  | "review"
  | "mention"
  | "verification"
  | "updates";

export interface NotificationSoundPrefs {
  enabled: boolean;
  volume: number; // 0–100
  backgroundOnly: boolean;
  muteWhileRecording: boolean;
  doNotDisturb: boolean;
  categories: Record<NotificationCategory, SoundName>;
}

export const SOUND_NAMES: SoundName[] = [
  "clair",
  "doux",
  "alerte",
  "discret",
  "aucun",
];

export const DEFAULT_SOUND_PREFS: NotificationSoundPrefs = {
  enabled: true,
  volume: 60,
  backgroundOnly: false,
  muteWhileRecording: true,
  doNotDisturb: false,
  categories: {
    ready: "clair",
    problem: "alerte",
    review: "doux",
    mention: "doux",
    verification: "alerte",
    updates: "discret",
  },
};

export function resolveSoundPrefs(
  saved?: Partial<NotificationSoundPrefs> | null,
): NotificationSoundPrefs {
  return {
    ...DEFAULT_SOUND_PREFS,
    ...(saved ?? {}),
    categories: {
      ...DEFAULT_SOUND_PREFS.categories,
      ...(saved?.categories ?? {}),
    },
  };
}

/** Which category (and so which sound and priority) a notification type has. */
export function categoryOf(type: string): NotificationCategory {
  if (type === "meeting.ready" || type === "meeting.published") return "ready";
  if (type === "meeting.failed") return "problem";
  if (type === "meeting.review_needed" || type === "page.approval_requested")
    return "review";
  if (
    type === "page.user_mention" ||
    type === "comment.user_mention" ||
    type === "comment.created" ||
    type === "comment.resolved" ||
    type === "page.permission_granted"
  )
    return "mention";
  if (type.startsWith("page.verification") || type === "page.approval_rejected")
    return "verification";
  return "updates";
}

/** Events important enough for a toast, not only the bell. */
export function isHighPriority(type: string): boolean {
  return (
    type === "meeting.ready" ||
    type === "meeting.failed" ||
    type === "meeting.review_needed" ||
    type === "page.user_mention" ||
    type === "comment.user_mention"
  );
}

// ---------- synthesis ----------

type Note = { freq: number; start: number; dur: number; type?: OscillatorType };

const PATTERNS: Record<Exclude<SoundName, "aucun">, Note[]> = {
  // two rising notes: something is ready
  clair: [
    { freq: 784, start: 0, dur: 0.14 },
    { freq: 1175, start: 0.12, dur: 0.22 },
  ],
  // one round note: someone is talking to you
  doux: [{ freq: 660, start: 0, dur: 0.32, type: "sine" }],
  // two falling notes: action needed
  alerte: [
    { freq: 880, start: 0, dur: 0.16, type: "triangle" },
    { freq: 587, start: 0.16, dur: 0.26, type: "triangle" },
  ],
  // a very light tick
  discret: [{ freq: 1568, start: 0, dur: 0.06, type: "sine" }],
};

let audioContext: AudioContext | null = null;

function context(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    audioContext ??= new Ctor();
    if (audioContext.state === "suspended") void audioContext.resume();
    return audioContext;
  } catch {
    return null;
  }
}

/** Plays a sound now. Browsers only allow it after a user interaction on
 *  the page; before that the call is silently ignored. */
export function playSound(name: SoundName, volume = 60): void {
  if (name === "aucun" || volume <= 0) return;
  const ctx = context();
  if (!ctx) return;
  const peak = Math.min(1, Math.max(0, volume / 100)) * 0.25;
  const t0 = ctx.currentTime + 0.01;
  for (const note of PATTERNS[name]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = note.type ?? "sine";
    osc.frequency.value = note.freq;
    const start = t0 + note.start;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + note.dur + 0.02);
  }
}

// ---------- policy ----------

const PLAYED_PREFIX = "conqr.notif.sounded.";
const RECORDING_KEY = "conqr.recording.active";

/** True the first time an id is claimed across all tabs of this browser. */
function claimOnce(id: string): boolean {
  try {
    const key = PLAYED_PREFIX + id;
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, String(Date.now()));
    // keep the store small
    const keys = Object.keys(localStorage).filter((k) =>
      k.startsWith(PLAYED_PREFIX),
    );
    if (keys.length > 200) {
      keys
        .sort(
          (a, b) =>
            Number(localStorage.getItem(a)) - Number(localStorage.getItem(b)),
        )
        .slice(0, keys.length - 200)
        .forEach((k) => localStorage.removeItem(k));
    }
    return true;
  } catch {
    return true;
  }
}

/** ConqrMeet sets this while a recording runs (same origin only). */
export function setRecordingActive(active: boolean): void {
  try {
    if (active) localStorage.setItem(RECORDING_KEY, String(Date.now()));
    else localStorage.removeItem(RECORDING_KEY);
  } catch {
    /* ignore */
  }
}

function recordingActive(): boolean {
  try {
    const since = Number(localStorage.getItem(RECORDING_KEY) ?? 0);
    // a crashed tab must not mute sounds forever
    return since > 0 && Date.now() - since < 4 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/** Plays the category sound for a new notification if the person allows it. */
export function soundForNotification(
  notification: { id: string; type: string },
  prefs: NotificationSoundPrefs,
): SoundName | null {
  if (!prefs.enabled || prefs.doNotDisturb) return null;
  if (prefs.backgroundOnly && document.visibilityState === "visible")
    return null;
  if (prefs.muteWhileRecording && recordingActive()) return null;
  const sound = prefs.categories[categoryOf(notification.type)];
  if (!sound || sound === "aucun") return null;
  if (!claimOnce(notification.id)) return null;
  playSound(sound, prefs.volume);
  return sound;
}
