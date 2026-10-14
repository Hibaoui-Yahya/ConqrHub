import { useEffect, useRef } from "react";
import { useAtom, useAtomValue } from "jotai";
import { useQueryClient } from "@tanstack/react-query";
import { notifications as toasts } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { socketAtom } from "@/features/websocket/atoms/socket-atom";
import { userAtom } from "@/features/user/atoms/current-user-atom";
import { NOTIFICATION_KEY } from "../queries/notification-query";
import { getNotifications } from "../services/notification-service";
import {
  isHighPriority,
  resolveSoundPrefs,
  soundForNotification,
} from "../notification-sounds";
import { notificationText } from "../notification-text";

/**
 * Live notifications: refresh the bell, play the category sound and, for
 * important events, show a toast with a link.
 */
export function useNotificationSocket() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [socket] = useAtom(socketAtom);
  const user = useAtomValue(userAtom);
  const prefsRef = useRef(resolveSoundPrefs());
  prefsRef.current = resolveSoundPrefs(
    user?.settings?.preferences?.notificationSounds,
  );

  useEffect(() => {
    if (!socket) return;

    const handler = async (payload?: { id?: string; type?: string }) => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEY });
      if (!payload?.id || !payload.type) return;
      soundForNotification(
        { id: payload.id, type: payload.type },
        prefsRef.current,
      );
      if (!isHighPriority(payload.type)) return;
      try {
        const page = await getNotifications({ limit: 10 });
        const n = page.items.find((x) => x.id === payload.id);
        if (!n) return;
        const text = notificationText(n, t);
        toasts.show({
          id: `notif-${n.id}`,
          title: text.title,
          message: text.detail,
          color: text.color,
          autoClose: 6000,
        });
      } catch {
        /* the bell still shows it */
      }
    };

    socket.on("notification", handler);
    return () => {
      socket.off("notification", handler);
    };
  }, [socket, queryClient, t]);
}
