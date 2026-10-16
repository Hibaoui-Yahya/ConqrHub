import { useEffect, useState } from "react";
import { Button, Modal } from "@mantine/core";
import { IconArrowRight, IconCheck } from "@tabler/icons-react";
import classes from "./first-run.module.css";

export interface TourStep {
  chapter: string;
  title: string;
  body: string;
  points: string[];
  /** Replace body/points for workspace owners and admins. */
  adminBody?: string;
  adminPoints?: string[];
}

interface ProductTourProps {
  opened: boolean;
  steps: TourStep[];
  /** Folder of 01.webp … NN.webp illustrations. */
  imageBase: string;
  isAdmin?: boolean;
  finishLabel: string;
  /** completed = reached the last step; false = skipped or closed. */
  onClose: (completed: boolean) => void;
}

/**
 * First-run product tour: one modal, one illustration per step (exported
 * from the design), keyboard arrows to move, Escape to skip.
 */
export function ProductTour({
  opened,
  steps,
  imageBase,
  isAdmin,
  finishLabel,
  onClose,
}: ProductTourProps) {
  const [i, setI] = useState(0);
  const total = steps.length;
  const step = steps[i];
  const last = i === total - 1;

  useEffect(() => {
    if (opened) setI(0);
  }, [opened]);

  useEffect(() => {
    if (!opened) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((v) => Math.min(v + 1, total - 1));
      if (e.key === "ArrowLeft") setI((v) => Math.max(v - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opened, total]);

  // Preload the next illustration so steps change without a flash.
  useEffect(() => {
    if (!opened || last) return;
    const img = new Image();
    img.src = `${imageBase}/${String(i + 2).padStart(2, "0")}.webp`;
  }, [opened, i, last, imageBase]);

  const body = isAdmin && step.adminBody ? step.adminBody : step.body;
  const points = isAdmin && step.adminPoints ? step.adminPoints : step.points;

  return (
    <Modal
      opened={opened}
      onClose={() => onClose(false)}
      withCloseButton={false}
      size={1100}
      padding={0}
      radius={18}
      centered
      overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
      classNames={{ body: classes.tourBody, content: classes.tourContent }}
      aria-label={`Visite guidée — ${step.title}`}
    >
      <div className={classes.tour}>
        <div className={classes.tourArt}>
          <img
            src={`${imageBase}/${String(i + 1).padStart(2, "0")}.webp`}
            alt=""
          />
        </div>
        <div className={classes.tourText}>
          <div className={classes.tourTop}>
            <div className={classes.eyebrow}>
              <span className={classes.eyebrowTile}>
                <span />
              </span>
              Étape {i + 1} sur {total} · {step.chapter}
            </div>
            <h2 className={classes.tourTitle}>{step.title}</h2>
            <p className={classes.tourLead}>{body}</p>
            <ul className={classes.points}>
              {points.map((p) => (
                <li key={p}>
                  <span className={classes.tick}>
                    <IconCheck size={11} stroke={2.5} />
                  </span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className={classes.tourBottom}>
            <div className={classes.progress} aria-hidden="true">
              {steps.map((_, k) => (
                <span key={k} data-on={k <= i ? "1" : "0"} />
              ))}
            </div>
            <div className={classes.nav}>
              <button
                type="button"
                className={classes.skip}
                onClick={() => onClose(false)}
              >
                {last ? "Revoir : menu du compte" : "Passer la visite"}
              </button>
              <div className={classes.navButtons}>
                {i > 0 && (
                  <Button
                    variant="default"
                    onClick={() => setI(i - 1)}
                    radius="md"
                  >
                    Précédent
                  </Button>
                )}
                <Button
                  data-autofocus
                  className={classes.primary}
                  radius="md"
                  rightSection={<IconArrowRight size={15} />}
                  onClick={() => (last ? onClose(true) : setI(i + 1))}
                >
                  {last ? finishLabel : "Suivant"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
