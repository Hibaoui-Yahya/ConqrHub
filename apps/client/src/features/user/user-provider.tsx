import { useAtom, useSetAtom } from "jotai";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import React, { useEffect } from "react";
import useCurrentUser from "@/features/user/hooks/use-current-user";
import { useTranslation } from "react-i18next";
import { socketAtom } from "@/features/websocket/atoms/socket-atom.ts";
import { io } from "socket.io-client";
import { SOCKET_URL } from "@/features/websocket/types";
import { useQuerySubscription } from "@/features/websocket/use-query-subscription.ts";
import { useTreeSocket } from "@/features/websocket/use-tree-socket.ts";
import { useNotificationSocket } from "@/features/notification/hooks/use-notification-socket.ts";
import { useCollabToken } from "@/features/auth/queries/auth-query.tsx";
import { Error404 } from "@/components/ui/error-404.tsx";
import { useEntitlements } from "@/ee/entitlement/use-entitlements";
import { entitlementAtom } from "@/ee/entitlement/entitlement-atom";
import api from "@/lib/api-client";
import APP_ROUTE from "@/lib/app-route.ts";
import { onLoggedOutElsewhere } from "@/features/auth/lib/auth-broadcast.ts";

export function UserProvider({ children }: React.PropsWithChildren) {
  const [, setCurrentUser] = useAtom(currentUserAtom);
  const setEntitlements = useSetAtom(entitlementAtom);
  const { data, isLoading, error, isError } = useCurrentUser();
  const { data: entitlements } = useEntitlements();
  const { i18n } = useTranslation();
  const [, setSocket] = useAtom(socketAtom);
  // fetch collab token on load
  const { data: collab } = useCollabToken();

  useEffect(() => {
    if (isLoading || isError) {
      return;
    }

    const newSocket = io(SOCKET_URL, {
      transports: ["websocket"],
      withCredentials: true,
    });

    // @ts-ignore
    setSocket(newSocket);

    newSocket.on("connect", () => {
      console.log("ws connected");
    });

    // The server drops the socket when this session is revoked (logout from
    // ConqrMeet or another device, password change, deactivation). Ask the
    // API once: a revoked session answers 401 and the client goes to sign-in;
    // an outage keeps the user where they are.
    const recheckSession = () => {
      api.post("/users/me").catch(() => undefined);
    };
    newSocket.on("Unauthorized", recheckSession);
    newSocket.on("disconnect", (reason) => {
      if (reason === "io server disconnect") recheckSession();
    });

    return () => {
      console.log("ws disconnected");
      newSocket.disconnect();
    };
  }, [isError, isLoading]);

  // Another tab of this browser signed out: leave too.
  useEffect(
    () =>
      onLoggedOutElsewhere(() => {
        window.location.replace(APP_ROUTE.AUTH.LOGIN);
      }),
    [],
  );

  useQuerySubscription();
  useTreeSocket();
  useNotificationSocket();

  useEffect(() => {
    if (data && data.user && data.workspace) {
      setCurrentUser(data);
      i18n.changeLanguage(
        data.user.locale === "en" ? "en-US" : data.user.locale,
      );
    }
  }, [data, isLoading]);

  useEffect(() => {
    if (entitlements) {
      setEntitlements(entitlements);
    }
  }, [entitlements]);

  if (isLoading) return <></>;

  if (isError && error?.["response"]?.status === 404) {
    return <Error404 />;
  }

  if (error) {
    return <></>;
  }

  return <>{children}</>;
}
