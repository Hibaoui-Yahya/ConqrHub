/**
 * Onboarding tracks: the first three things to do, by job. Mapped from the
 * roles published by the client (e.g. La Tête Chercheuse) and the account
 * role. Texts are French: first-run pages only show for a branded client.
 */
export type TrackKey = "piloter" | "recruter" | "rayonner" | "administrer";

export interface Track {
  key: TrackKey;
  name: string;
  /** Where the first gesture happens. */
  app: "ConqrHub" | "ConqrMeet";
  icon: string;
  steps: [string, string][];
}

export const TRACKS: Record<TrackKey, Track> = {
  piloter: {
    key: "piloter",
    name: "Piloter",
    app: "ConqrHub",
    icon: "layout-dashboard",
    steps: [
      [
        "Inviter l'équipe et gérer les accès",
        "Paramètres › Membres et groupes",
      ],
      [
        "Suivre la santé documentaire de chaque espace",
        "Pages vérifiées, à revérifier, alertes",
      ],
      [
        "Approuver les pages de référence du cabinet",
        "Politiques et procédures officielles",
      ],
    ],
  },
  recruter: {
    key: "recruter",
    name: "Recruter",
    app: "ConqrMeet",
    icon: "mic",
    steps: [
      [
        "Enregistrer votre prochaine entrevue",
        "Avec le consentement du candidat, dans ConqrMeet",
      ],
      [
        "Évaluer avec la grille",
        "Chaque niveau s'appuie sur une citation vérifiée",
      ],
      [
        "Publier le rapport dans ConqrHub",
        "Toute l'équipe le retrouve, avec la transcription",
      ],
    ],
  },
  rayonner: {
    key: "rayonner",
    name: "Faire rayonner",
    app: "ConqrHub",
    icon: "speakerphone",
    steps: [
      [
        "Retrouver les contenus validés du cabinet",
        "Dans vos espaces ConqrHub",
      ],
      [
        "Demander à l'IA une synthèse",
        "À partir des pages vérifiées, sources citées",
      ],
      [
        "Enregistrer vos rencontres clients",
        "Avec ConqrMeet, compte rendu en prime",
      ],
    ],
  },
  administrer: {
    key: "administrer",
    name: "Administrer",
    app: "ConqrHub",
    icon: "settings",
    steps: [
      [
        "Vérifier que chaque membre a activé son compte",
        "Paramètres › Membres et groupes",
      ],
      [
        "Gérer les rôles, les groupes et les espaces",
        "Qui voit et qui modifie quoi",
      ],
      ["Suivre les invitations en attente", "Les relancer au besoin"],
    ],
  },
};

const norm = (s: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Track from the job title first, then the workspace role. */
export function trackFor(jobTitle: string | undefined, role?: string): Track {
  const t = norm(jobTitle ?? "");
  if (
    /president|associee principale|associe principal|direction generale/.test(t)
  )
    return TRACKS.piloter;
  if (/operations|administration/.test(t)) return TRACKS.administrer;
  if (/rayonnement|communication|marketing/.test(t) && !/talent/.test(t))
    return TRACKS.rayonner;
  if (/talent|recrut|conseill|consultant|chasse/.test(t))
    return TRACKS.recruter;
  if (role === "owner" || role === "admin") return TRACKS.piloter;
  return TRACKS.recruter;
}
