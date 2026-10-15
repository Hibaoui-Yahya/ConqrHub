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
  team: { name: string; photo: string }[];
  /** Head count shown on small screens (photos may be missing for some). */
  teamSize?: number;
  facts: { value: string; label: string }[];
  /** Interface language before anyone signs in. */
  defaultLocale?: string;
}

const LTC_TEAM = [
  ["Elisabeth Starenkyj", "elisabeth-starenkyj"],
  ["Annie Bissonnette", "annie-bissonnette"],
  ["Sébastien Vachon", "sebastien-vachon"],
  ["Sophia Hoareau", "sophia-hoareau"],
  ["Marc Michaud", "marc-michaud"],
  ["Laure Broisin", "laure-broisin"],
  ["Elsa Vecchi", "elsa-vecchi"],
  ["Caroline Blackburn", "caroline-blackburn"],
  ["Meggie Blanchard", "meggie-blanchard"],
  ["Geneviève Clément", "genevieve-clement"],
  ["Guillaume Lachance", "guillaume-lachance"],
  ["Alice Henrottay", "alice-henrottay"],
  ["Amélie Bissonnette-Théorêt", "amelie-bissonnette-theoret"],
  ["Nour Saci", "nour-saci"],
].map(([name, file]) => ({ name, photo: `/branding/ltc/team/${file}.jpg` }));

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
