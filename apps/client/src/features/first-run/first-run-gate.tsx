import { useEffect } from "react";
import { useAtom } from "jotai";
import { useLocation, useNavigate } from "react-router-dom";
import { ProductTour } from "./product-tour.tsx";
import { HUB_TOUR_STEPS } from "./hub-tour-steps.ts";
import { hubTourOpenAtom, useFirstRun } from "./first-run.ts";
import useUserRole from "@/hooks/use-user-role.tsx";

/**
 * Inside the signed-in layout: sends a first-time user to the welcome
 * steps, then opens the ConqrHub tour once on the home page. The account
 * menu can reopen the tour at any time.
 */
export function FirstRunGate() {
  const { user, state, enabled, save } = useFirstRun();
  const [open, setOpen] = useAtom(hubTourOpenAtom);
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin } = useUserRole();

  useEffect(() => {
    if (!enabled || !user) return;
    if (!state.onboardedAt) {
      navigate("/welcome", { replace: true });
      return;
    }
    if (!state.hubTourSeenAt && location.pathname.startsWith("/home")) {
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, user?.id, state.onboardedAt, state.hubTourSeenAt]);

  if (!enabled) return null;

  return (
    <ProductTour
      opened={open}
      steps={HUB_TOUR_STEPS}
      imageBase="/tour/hub"
      isAdmin={isAdmin}
      finishLabel="Ouvrir mon espace"
      onClose={() => {
        setOpen(false);
        if (!state.hubTourSeenAt) {
          save({ hubTourSeen: true }).catch(() => undefined);
        }
      }}
    />
  );
}
