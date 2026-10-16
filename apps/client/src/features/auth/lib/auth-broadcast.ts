/**
 * Cross-tab sign-out signal for ConqrHub. When one tab signs out, the other
 * open tabs of the same browser leave the app at once instead of discovering
 * it on their next request. The server stays the authority: this only
 * shortens the delay.
 */
const CHANNEL = "conqrhub-auth";

type AuthMessage = { type: "logged-out" };

function channel(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel(CHANNEL);
  } catch {
    return null;
  }
}

export function announceLoggedOut(): void {
  const ch = channel();
  if (!ch) return;
  ch.postMessage({ type: "logged-out" } satisfies AuthMessage);
  ch.close();
}

/** Calls `onLoggedOut` when another tab signs out; returns the unsubscribe. */
export function onLoggedOutElsewhere(onLoggedOut: () => void): () => void {
  const ch = channel();
  if (!ch) return () => {};
  ch.onmessage = (event: MessageEvent<AuthMessage>) => {
    if (event.data?.type === "logged-out") onLoggedOut();
  };
  return () => ch.close();
}
