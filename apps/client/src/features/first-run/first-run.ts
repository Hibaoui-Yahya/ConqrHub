import { atom, useAtom } from "jotai";
import { useCallback } from "react";
import {
  currentUserAtom,
  userAtom,
} from "@/features/user/atoms/current-user-atom.ts";
import { updateUser } from "@/features/user/services/user-service.ts";
import { getClientBrand } from "@/lib/client-brand.ts";

export interface FirstRunState {
  onboardedAt?: string;
  hubTourSeenAt?: string;
  meetTourSeenAt?: string;
  jobTitle?: string;
}

/** Opens the product tour from anywhere (e.g. the account menu). */
export const hubTourOpenAtom = atom(false);

/** First-run pages ship with a client identity only (CLIENT_BRAND). */
export function isFirstRunEnabled(): boolean {
  return getClientBrand().key !== "conqrai";
}

export function useFirstRun() {
  const [currentUser] = useAtom(currentUserAtom);
  const [, setUser] = useAtom(userAtom);
  const user = currentUser?.user;
  const state: FirstRunState =
    ((user?.settings?.preferences as any)?.firstRun as FirstRunState) ?? {};

  const save = useCallback(
    async (firstRun: {
      onboarded?: boolean;
      hubTourSeen?: boolean;
      jobTitle?: string;
    }) => {
      const updated = await updateUser({ firstRun } as any);
      if (updated && currentUser?.user) {
        setUser({ ...currentUser.user, settings: updated.settings });
      }
      return updated;
    },
    [currentUser, setUser],
  );

  return { user, state, enabled: isFirstRunEnabled(), save };
}
