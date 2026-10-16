import { getConfigValue } from "@/lib/config.ts";

/**
 * Client identity shown around the sign-in pages. A deployment opts in with
 * CLIENT_BRAND (e.g. "ltc" on the La Tête Chercheuse environment); without
 * it the pages carry the neutral ConqrAI identity.
 */
export interface ClientBrand {
  key: string;
  name: string;
  /** English key, translated through i18n like the rest of the UI. */
  tagline: string;
  slogan: string;
  pitch: string;
  /** Square mark on a dark panel (white tile). */
  markSrc?: string;
  team: { name: string; photo: string; title?: string }[];
  /** People listed by the client without a photo. */
  extraMembers?: { name: string; title?: string }[];
  /** Head count shown on small screens (photos may be missing for some). */
  teamSize?: number;
  facts: { value: string; label: string }[];
  /** Interface language before anyone signs in. */
  defaultLocale?: string;
}

/** Team as published on latetechercheuse.com (Cabinet de recrutement). */
const LTC_TEAM = [
  [
    "Elisabeth Starenkyj",
    "elisabeth-starenkyj",
    "Co-présidente, associée principale",
  ],
  [
    "Annie Bissonnette",
    "annie-bissonnette",
    "Co-présidente, associée principale",
  ],
  [
    "Sébastien Vachon",
    "sebastien-vachon",
    "Directeur, gestion de talents, associé",
  ],
  ["Sophia Hoareau", "sophia-hoareau", "Directrice, gestion de talents"],
  [
    "Marc Michaud",
    "marc-michaud",
    "Directeur, gestion de talents et développement des affaires",
  ],
  ["Laure Broisin", "laure-broisin", "Directrice, gestion de talents"],
  ["Elsa Vecchi", "elsa-vecchi", "Conseillère principale, gestion de talents"],
  [
    "Caroline Blackburn",
    "caroline-blackburn",
    "Conseillère principale, gestion de talents",
  ],
  [
    "Meggie Blanchard",
    "meggie-blanchard",
    "Conseillère principale, gestion de talents",
  ],
  [
    "Geneviève Clément",
    "genevieve-clement",
    "Conseillère principale, gestion de talents",
  ],
  [
    "Guillaume Lachance",
    "guillaume-lachance",
    "Conseiller, gestion de talents",
  ],
  ["Alice Henrottay", "alice-henrottay", "Conseillère, gestion de talents"],
  [
    "Amélie Bissonnette-Théorêt",
    "amelie-bissonnette-theoret",
    "Coordonnatrice, rayonnement et développement des affaires",
  ],
  ["Nour Saci", "nour-saci", "Coordonnatrice, opérations et administration"],
].map(([name, file, title]) => ({
  name,
  title,
  photo: `/branding/ltc/team/${file}.jpg`,
}));

/** Published members without a photo (shown with initials). */
const LTC_EXTRA = [
  { name: "Geneviève Moreau", title: "Conseillère, gestion de talents" },
];

const BRANDS: Record<string, ClientBrand> = {
  ltc: {
    key: "ltc",
    name: "La Tête Chercheuse",
    tagline: "Recruitment firm · since 1997",
    slogan: "Powered by human talent.",
    pitch:
      "Your interviews in ConqrMeet, your team's knowledge in ConqrHub. One account for both.",
    markSrc: "/branding/ltc/ltc-mark.svg",
    team: LTC_TEAM,
    extraMembers: LTC_EXTRA,
    teamSize: 15,
    facts: [
      { value: "1997", label: "Founded in Montréal" },
      { value: "15", label: "people on the team" },
      { value: "3 400+", label: "candidates placed" },
    ],
    defaultLocale: "fr-FR",
  },
};

const NEUTRAL: ClientBrand = {
  key: "conqrai",
  name: "ConqrAI",
  tagline: "",
  slogan: "Your team's knowledge, in one place.",
  pitch:
    "Pages, meetings and answers your team can trust. One account for every app.",
  team: [],
  facts: [],
};

export function getClientBrand(): ClientBrand {
  const key = (getConfigValue("CLIENT_BRAND") || "").trim().toLowerCase();
  return BRANDS[key] ?? NEUTRAL;
}

function normalize(name: string): string {
  return (name || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/,.*$/, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();
}

/** The published profile (role, photo) matching an account name, if any. */
export function findBrandMember(
  name: string | undefined,
): { name: string; title?: string; photo?: string } | undefined {
  if (!name) return undefined;
  const brand = getClientBrand();
  const key = normalize(name);
  return [...brand.team, ...(brand.extraMembers ?? [])].find(
    (m) => normalize(m.name) === key,
  );
}
