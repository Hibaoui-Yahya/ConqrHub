import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAtom } from "jotai";
import { Helmet } from "react-helmet-async";
import { Button, SegmentedControl, Text, TextInput } from "@mantine/core";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconCircleCheck,
  IconLayoutDashboard,
  IconMicrophone,
  IconPhoto,
  IconSettings,
  IconSpeakerphone,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import classes from "./first-run.module.css";
import { useFirstRun } from "./first-run.ts";
import { Track, trackFor } from "./tracks.ts";
import { findBrandMember, getClientBrand } from "@/lib/client-brand.ts";
import { getSuiteAppUrls } from "@/lib/config.ts";
import AccountAvatar from "@/features/user/components/account-avatar.tsx";
import { uploadUserAvatar } from "@/features/attachments/services/attachment-service.ts";
import { updateUser } from "@/features/user/services/user-service.ts";
import {
  currentUserAtom,
  userAtom,
} from "@/features/user/atoms/current-user-atom.ts";
import APP_ROUTE from "@/lib/app-route.ts";

const TRACK_ICON = {
  piloter: IconLayoutDashboard,
  recruter: IconMicrophone,
  rayonner: IconSpeakerphone,
  administrer: IconSettings,
};

const STEPS: [string, string][] = [
  ["Votre compte", "Mot de passe"],
  ["Votre profil", "Photo et langue"],
  ["Votre micro", "Test du son"],
  ["Visite guidée", "Trois gestes"],
  ["C'est prêt", "Premiers pas"],
];

export type WelcomePhase = "hello" | 1 | 2 | 3 | 4;
type Phase = WelcomePhase;

/**
 * First visit after the invitation: a personal welcome (photo, role, track),
 * then four short steps. Step 0 (account) was the invitation sign-up itself.
 */
export default function WelcomePage({
  initialPhase = "hello",
}: {
  /** Starting screen (the welcome card by default). */
  initialPhase?: WelcomePhase;
}) {
  const { user, state, enabled, save } = useFirstRun();
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const navigate = useNavigate();
  const brand = getClientBrand();
  const member = useMemo(() => findBrandMember(user?.name), [user?.name]);
  const [jobTitle, setJobTitle] = useState("");

  useEffect(() => {
    setJobTitle(state.jobTitle || member?.title || "");
  }, [state.jobTitle, member?.title]);

  if (!enabled) return <Navigate to={APP_ROUTE.HOME} replace />;
  if (!user) return null;

  const first = (user.name || "").trim().split(/\s+/)[0];
  const track = trackFor(jobTitle, user.role);

  const finish = async (target: "hub" | "meet") => {
    try {
      await save({ onboarded: true, jobTitle: jobTitle.trim() });
    } catch {
      // the next visit offers the welcome again; never block the user here
    }
    const meet = getSuiteAppUrls().meet;
    if (target === "meet" && meet) window.location.assign(meet);
    else navigate(APP_ROUTE.HOME, { replace: true });
  };

  if (phase === "hello") {
    return (
      <>
        <Helmet>
          <title>Bienvenue · ConqrHub</title>
        </Helmet>
        <WelcomeCard
          first={first}
          name={user.name}
          avatarUrl={user.avatarUrl}
          photo={member?.photo}
          jobTitle={jobTitle}
          track={track}
          onStart={() => setPhase(1)}
          onSkip={() => finish("hub")}
        />
      </>
    );
  }

  const index = phase as number; // 1..4 (STEPS[0] is done)
  return (
    <div className={classes.page}>
      <Helmet>
        <title>Bienvenue · ConqrHub</title>
      </Helmet>
      <aside className={classes.rail}>
        <div>
          <div className={classes.brand}>
            {brand.markSrc && <img src={brand.markSrc} alt="" />}
            {brand.name}
          </div>
          <div className={classes.railKicker}>Bienvenue dans votre espace</div>
          <div className={classes.railTitle}>
            Cinq minutes pour tout préparer.
          </div>
          <div className={classes.steps}>
            {STEPS.map(([n, h], k) => {
              const s = k < index ? "done" : k === index ? "current" : "todo";
              return (
                <div
                  key={n}
                  className={classes.step}
                  data-current={s === "current" ? "1" : "0"}
                >
                  <span className={classes.dot} data-state={s}>
                    {s === "done" ? <IconCheck size={14} stroke={3} /> : k + 1}
                  </span>
                  <div className={classes.stepTexts}>
                    <div
                      className={classes.stepName}
                      data-on={s !== "todo" ? "1" : "0"}
                    >
                      {n}
                    </div>
                    <div className={classes.stepHint}>{h}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {brand.team.length > 0 && (
          <div className={classes.team}>
            <div className={classes.avatars}>
              {brand.team.slice(0, 5).map((m) => (
                <img key={m.photo} src={m.photo} alt="" />
              ))}
            </div>
            Toute l'équipe vous attend
          </div>
        )}
      </aside>

      <main className={classes.main}>
        <div>
          <div className={classes.topRow}>
            <span>Étape {index + 1} sur 5</span>
            {(phase === 2 || phase === 3) && (
              <button
                type="button"
                className={classes.skip}
                style={{ color: "#006399" }}
                onClick={() => setPhase((phase + 1) as Phase)}
              >
                Passer cette étape
              </button>
            )}
          </div>
          <div className={classes.progress}>
            {STEPS.map((_, k) => (
              <span key={k} data-on={k <= index ? "1" : "0"} />
            ))}
          </div>
        </div>

        <div className={classes.content}>
          {phase === 1 && (
            <ProfileStep
              member={member}
              jobTitle={jobTitle}
              setJobTitle={setJobTitle}
            />
          )}
          {phase === 2 && <MicStep />}
          {phase === 3 && <GesturesStep track={track} />}
          {phase === 4 && <ReadyStep first={first} onChoose={finish} />}
        </div>

        <div className={classes.actions}>
          <Button
            variant="subtle"
            color="gray"
            leftSection={<IconArrowLeft size={16} />}
            onClick={() =>
              setPhase(phase === 1 ? "hello" : ((phase - 1) as Phase))
            }
          >
            Retour
          </Button>
          {phase !== 4 && (
            <Button
              size="md"
              className={classes.primary}
              rightSection={<IconArrowRight size={16} />}
              onClick={async () => {
                if (phase === 1 && jobTitle.trim() !== (state.jobTitle ?? "")) {
                  save({ jobTitle: jobTitle.trim() }).catch(() => undefined);
                }
                setPhase((phase + 1) as Phase);
              }}
            >
              Continuer
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}

function WelcomeCard(props: {
  first: string;
  name: string;
  avatarUrl?: string;
  photo?: string;
  jobTitle: string;
  track: Track;
  onStart: () => void;
  onSkip: () => void;
}) {
  const Icon = TRACK_ICON[props.track.key];
  const initials = props.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className={classes.welcomeWrap}>
      <div className={classes.welcomeCard}>
        <div className={classes.identity}>
          {props.photo ? (
            <img className={classes.photo} src={props.photo} alt="" />
          ) : (
            <div className={classes.photo}>{initials}</div>
          )}
          <div className={classes.idName}>{props.name}</div>
          {props.jobTitle && (
            <div className={classes.idRole}>{props.jobTitle}</div>
          )}
          <span className={classes.trackChip}>
            <Icon size={12} />
            Parcours {props.track.name}
          </span>
        </div>
        <div className={classes.welcomeBody}>
          <div>
            <Text
              size="xs"
              fw={700}
              c="dimmed"
              tt="uppercase"
              style={{ letterSpacing: "0.1em" }}
            >
              Accueil · avant les 5 étapes
            </Text>
            <h1
              className={classes.heading}
              style={{ marginTop: 12, fontSize: 26 }}
            >
              Bienvenue, {props.first}
            </h1>
            <p className={classes.sub}>
              Votre espace est prêt. Voici par où commencer, selon votre métier.
            </p>
            <ol
              className={classes.numbered}
              style={{ listStyle: "none", padding: 0, marginTop: 16 }}
            >
              {props.track.steps.map(([t, d], k) => (
                <li key={t}>
                  <span
                    className={classes.num}
                    data-first={k === 0 ? "1" : "0"}
                  >
                    {k + 1}
                  </span>
                  <div>
                    <Text size="sm" fw={k === 0 ? 700 : 500}>
                      {t}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {d}
                    </Text>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className={classes.actions}>
            <button
              type="button"
              className={classes.skip}
              onClick={props.onSkip}
            >
              Passer l'accueil
            </button>
            <Button
              className={classes.primary}
              rightSection={<IconArrowRight size={15} />}
              onClick={props.onStart}
            >
              Commencer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileStep(props: {
  member?: { photo?: string };
  jobTitle: string;
  setJobTitle: (v: string) => void;
}) {
  const { i18n } = useTranslation();
  const [currentUser] = useAtom(currentUserAtom);
  const [, setUser] = useAtom(userAtom);
  const [busy, setBusy] = useState(false);
  const user = currentUser?.user;
  const lang = (user?.locale || i18n.language || "fr-FR").startsWith("en")
    ? "en-US"
    : "fr-FR";

  const usePublishedPhoto = async () => {
    if (!props.member?.photo || !user) return;
    setBusy(true);
    try {
      const blob = await (await fetch(props.member.photo)).blob();
      const file = new File([blob], "photo.jpg", {
        type: blob.type || "image/jpeg",
      });
      const avatar = await uploadUserAvatar(file);
      setUser({ ...user, avatarUrl: avatar.fileName });
    } catch {
      // the uploader below stays available
    } finally {
      setBusy(false);
    }
  };

  const setLang = async (value: string) => {
    if (!user) return;
    try {
      const updated = await updateUser({ locale: value } as any);
      setUser({ ...user, locale: updated?.locale ?? value });
      i18n.changeLanguage(value);
    } catch {
      // keep the current language
    }
  };

  return (
    <>
      <div>
        <h1 className={classes.heading}>Présentez-vous à l'équipe</h1>
        <p className={classes.sub}>
          Votre photo et votre fonction aident vos collègues à vous reconnaître
          dans ConqrHub et dans les comptes rendus de réunion.
        </p>
      </div>
      <div className={classes.card} style={{ alignItems: "center" }}>
        <AccountAvatar />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {props.member?.photo && !user?.avatarUrl && (
            <Button
              variant="default"
              leftSection={<IconPhoto size={15} />}
              loading={busy}
              onClick={usePublishedPhoto}
            >
              Utiliser ma photo du site
            </Button>
          )}
          <Text size="xs" c="dimmed">
            JPG ou PNG. Cliquez sur la photo pour la changer.
          </Text>
        </div>
      </div>
      <TextInput
        label="Fonction"
        description={
          props.member ? "Pré-remplie d'après le site du cabinet" : undefined
        }
        size="md"
        value={props.jobTitle}
        maxLength={120}
        onChange={(e) => props.setJobTitle(e.currentTarget.value)}
      />
      <div>
        <Text size="sm" fw={600} mb={6}>
          Langue de l'interface
        </Text>
        <SegmentedControl
          fullWidth
          size="md"
          value={lang}
          onChange={setLang}
          data={[
            { label: "Français", value: "fr-FR" },
            { label: "English", value: "en-US" },
          ]}
        />
        <Text size="xs" c="dimmed" mt={6}>
          Les comptes rendus restent dans la langue de la réunion.
        </Text>
      </div>
    </>
  );
}

const BARS = 28;

function MicStep() {
  const [levels, setLevels] = useState<number[]>(Array(BARS).fill(4));
  const [status, setStatus] = useState<
    "idle" | "on" | "clear" | "denied" | "none"
  >("idle");
  const stop = useRef<() => void>(() => undefined);

  useEffect(() => () => stop.current(), []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      src.connect(an);
      const data = new Uint8Array(an.frequencyBinCount);
      let raf = 0;
      let heard = 0;
      setStatus("on");
      const tick = () => {
        an.getByteFrequencyData(data);
        const step = Math.floor(data.length / BARS);
        const next = Array.from({ length: BARS }, (_, k) => {
          let sum = 0;
          for (let j = 0; j < step; j++) sum += data[k * step + j];
          return Math.max(4, Math.round((sum / step / 255) * 64));
        });
        const loud = next.filter((v) => v > 20).length;
        if (loud > 4) heard++;
        if (heard > 15) setStatus("clear");
        setLevels(next);
        raf = requestAnimationFrame(tick);
      };
      tick();
      stop.current = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        ctx.close().catch(() => undefined);
      };
    } catch (err: any) {
      setStatus(err?.name === "NotFoundError" ? "none" : "denied");
    }
  };

  return (
    <>
      <div>
        <h1 className={classes.heading}>Testez votre micro</h1>
        <p className={classes.sub}>
          Dites quelques mots à voix normale : la jauge doit suivre votre voix.
          Un bon son, c'est une transcription fidèle. Rien n'est enregistré.
        </p>
      </div>
      <div className={classes.panel}>
        <div className={classes.meter} aria-hidden="true">
          {levels.map((h, k) => (
            <span
              key={k}
              style={{ height: h }}
              data-on={
                status === "on" || status === "clear"
                  ? h > 10
                    ? "1"
                    : "0"
                  : "0"
              }
            />
          ))}
        </div>
        {status === "idle" && (
          <Button
            variant="default"
            leftSection={<IconMicrophone size={16} />}
            onClick={start}
            style={{ alignSelf: "flex-start" }}
          >
            Tester le micro
          </Button>
        )}
        {status === "on" && <Text size="sm">Dites quelques mots…</Text>}
        {status === "clear" && (
          <Text
            size="sm"
            fw={600}
            c="#1F7A4D"
            style={{ display: "flex", gap: 6, alignItems: "center" }}
          >
            <IconCircleCheck size={16} /> Le son est clair
          </Text>
        )}
        {status === "denied" && (
          <Text size="sm" c="red">
            L'accès au micro a été refusé. Autorisez-le dans la barre d'adresse,
            ou passez cette étape.
          </Text>
        )}
        {status === "none" && (
          <Text size="sm" c="red">
            Aucun micro n'a été trouvé sur cet appareil.
          </Text>
        )}
      </div>
      <ul className={classes.points}>
        {[
          "Placez-vous à 30 à 50 cm du micro.",
          "Préférez une pièce calme, sans écho.",
          "En cas de doute, refaites ce test depuis ConqrMeet avant l'entrevue.",
        ].map((t) => (
          <li key={t}>
            <span className={classes.tick}>
              <IconCheck size={11} stroke={2.5} />
            </span>
            {t}
          </li>
        ))}
      </ul>
    </>
  );
}

function GesturesStep({ track }: { track: Track }) {
  return (
    <>
      <div>
        <h1 className={classes.heading}>Trois gestes à retenir</h1>
        <p className={classes.sub}>
          Parcours {track.name} : tout le reste s'apprend en chemin.
        </p>
      </div>
      {track.steps.map(([t, d], k) => (
        <div key={t} className={classes.card}>
          <img
            src={
              track.app === "ConqrMeet" && k < 2
                ? "/branding/conqrmeet-mark.svg"
                : "/branding/conqrhub-mark.svg"
            }
            alt=""
            style={{ width: 32, height: 32 }}
          />
          <div>
            <Text
              size="xs"
              fw={700}
              c="#006399"
              tt="uppercase"
              style={{ letterSpacing: "0.1em" }}
            >
              {track.app === "ConqrMeet" && k < 2 ? "ConqrMeet" : "ConqrHub"}
            </Text>
            <Text fw={700}>{t}</Text>
            <Text size="sm" c="dimmed">
              {d}
            </Text>
          </div>
        </div>
      ))}
    </>
  );
}

function ReadyStep(props: {
  first: string;
  onChoose: (t: "hub" | "meet") => void;
}) {
  const meet = Boolean(getSuiteAppUrls().meet);
  return (
    <>
      <div>
        <div>
          <span
            style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              background: "#0a0a0a",
              color: "#00c2ff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconCheck size={28} stroke={2.5} />
          </span>
        </div>
        <h1 className={classes.heading} style={{ marginTop: 16 }}>
          Tout est prêt, {props.first}
        </h1>
        <p className={classes.sub}>
          Votre compte est actif. Par où voulez-vous commencer ?
        </p>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {meet && (
          <button
            type="button"
            className={classes.choice}
            onClick={() => props.onChoose("meet")}
          >
            <img src="/branding/conqrmeet-mark.svg" alt="" />
            <div>
              <Text size="xs" fw={700} c="dimmed">
                ConqrMeet
              </Text>
              <Text fw={700}>Enregistrer ma première entrevue</Text>
            </div>
          </button>
        )}
        <button
          type="button"
          className={classes.choice}
          onClick={() => props.onChoose("hub")}
        >
          <img src="/branding/conqrhub-mark.svg" alt="" />
          <div>
            <Text size="xs" fw={700} c="dimmed">
              ConqrHub
            </Text>
            <Text fw={700}>Explorer l'espace de l'équipe</Text>
          </div>
        </button>
      </div>
      <Text size="sm" c="dimmed">
        Une visite guidée de ConqrHub vous attend à l'arrivée. Vous pourrez la
        revoir depuis le menu du compte.
      </Text>
    </>
  );
}
