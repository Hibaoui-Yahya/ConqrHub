import { useTranslation } from "react-i18next";

const PHASE_TITLE_KEYS: Record<number, string> = {
  1: "Core Wiki Foundation",
  2: "Collaboration & Content Quality",
  3: "Business & Enterprise Security",
  4: "AI Knowledge Layer",
  5: "Migration & Integrations",
  6: "Governance & Intelligence",
  7: "External Knowledge Experience",
  8: "Enterprise Operations & Scale",
};

export function useUpgradeLabel(phase?: number): string {
  const { t } = useTranslation();

  if (phase != null && PHASE_TITLE_KEYS[phase]) {
    return t("Coming soon — Phase {{number}}: {{title}}", {
      number: phase,
      title: t(PHASE_TITLE_KEYS[phase]),
    });
  }
  return t("Coming soon");
}
