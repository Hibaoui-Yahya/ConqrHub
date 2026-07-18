import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Subscribes to the Integration Layer's SSE stream (blueprint §8.4) and
 * invalidates smart-object / relationship queries when a refresh event arrives,
 * so embedded work cards update live when Plane changes. Auth rides on the
 * existing JWT cookie (EventSource sends credentials same-origin).
 */
export function useIntegrationEvents(enabled = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const source = new EventSource("/api/integrations/events/stream", {
      withCredentials: true,
    });

    source.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data);
        // Any Plane work-item change → refresh resolved smart objects.
        if (String(event?.type ?? "").startsWith("conqr.plane.work-item")) {
          queryClient.invalidateQueries({ queryKey: ["smart-objects"] });
        }
        if (String(event?.type ?? "").includes("relationship")) {
          queryClient.invalidateQueries({ queryKey: ["relationships"] });
        }
      } catch {
        /* ignore malformed frames */
      }
    };

    // EventSource auto-reconnects; close on unmount.
    return () => source.close();
  }, [enabled, queryClient]);
}
