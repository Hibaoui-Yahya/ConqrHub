/**
 * Report language and time zone of a meeting's generated outputs.
 *
 * Language: the meeting's explicit language, then the language the
 * transcription detected, then the account / company defaults. It only
 * steers what the AI writes (summary, report, actions); the spoken words
 * and quotes are never translated.
 *
 * Time zone: one IANA zone for every date a meeting shows. The account's
 * own zone first when the reader is known, the company zone for shared
 * pages (Paramètres › Entreprise › Général), and a deployment fallback —
 * DEFAULT_TIMEZONE if the operator set one, else UTC — only when nothing is
 * configured. No tenant inherits another tenant's zone; every rendered
 * time names its zone, so a fallback is never mistaken for local time.
 * Pure; unit-tested in meeting-locale.util.spec.ts.
 */

/** Neutral last resort when no account, company or deployment zone exists. */
export const UTC_TIME_ZONE = 'UTC';

/** The deployment's zone (`DEFAULT_TIMEZONE`), validated, else UTC. */
export function deploymentTimeZone(
  env: Record<string, string | undefined> = process.env,
): string {
  const zone = env.DEFAULT_TIMEZONE?.trim();
  return zone && isValidTimeZone(zone) ? zone : UTC_TIME_ZONE;
}

export type ReportLanguage = string; // ISO 639-1, e.g. "fr", "en"

const LANGUAGE_NAMES: Record<string, { fr: string; en: string }> = {
  fr: { fr: 'français', en: 'French' },
  en: { fr: 'anglais', en: 'English' },
  es: { fr: 'espagnol', en: 'Spanish' },
  de: { fr: 'allemand', en: 'German' },
  it: { fr: 'italien', en: 'Italian' },
  pt: { fr: 'portugais', en: 'Portuguese' },
  nl: { fr: 'néerlandais', en: 'Dutch' },
};

/** "fr-CA" / "fr_FR" / "FR" → "fr"; anything unusable → null. */
export function normalizeLanguage(value: unknown): ReportLanguage | null {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^([a-zA-Z]{2})(?:[-_][a-zA-Z]{2,4})?$/);
  return m ? m[1].toLowerCase() : null;
}

/** First usable language among the candidates, most specific first. */
export function resolveReportLanguage(
  candidates: unknown[],
  fallback: ReportLanguage = 'fr',
): ReportLanguage {
  for (const candidate of candidates) {
    const lang = normalizeLanguage(candidate);
    if (lang) return lang;
  }
  return fallback;
}

/** Instruction appended to every report prompt. */
export function reportLanguageInstruction(lang: ReportLanguage): string {
  if (lang === 'fr') {
    return 'Rédige toute ta réponse en français (français canadien), y compris les titres et la vue d’ensemble. Les citations restent dans la langue où elles ont été dites.';
  }
  const name = LANGUAGE_NAMES[lang]?.en ?? `the language with ISO code "${lang}"`;
  return `Write your entire answer in ${name}, including headings and the overview. Quotations stay in the language they were spoken in.`;
}

/** Fixed labels the pipeline writes itself (headings, "none" lines). */
export interface ReportLabels {
  keyPoints: string;
  openQuestions: string;
  noActions: string;
  noDecisions: string;
  noNextSteps: string;
  summary: string;
  decisions: string;
  actionItems: string;
  nextSteps: string;
  meetingNotes: string;
  untitled: string;
  nothingRecorded: string;
  sectionNotGenerated: string;
  noOwner: string;
  lowConfidence: string;
  agreed: string;
  possibleDuplicate: string;
  noProject: string;
}

const FR_LABELS: ReportLabels = {
  keyPoints: 'Points clés',
  openQuestions: 'Questions ouvertes',
  noActions: '- Aucune action n’a été explicitement convenue.',
  noDecisions: '- Aucune décision n’a été consignée.',
  noNextSteps: '- Aucune prochaine étape n’a été identifiée.',
  summary: 'Résumé',
  decisions: 'Décisions',
  actionItems: 'Actions',
  nextSteps: 'Prochaines étapes',
  meetingNotes: 'Notes de réunion',
  untitled: 'Réunion sans titre',
  nothingRecorded: '_Rien de consigné._',
  sectionNotGenerated: '_Section non générée : relancez l’analyse._',
  noOwner: 'Aucun responsable n’a été nommé pendant la réunion.',
  lowConfidence: 'Confiance faible : vérifiez l’extrait cité.',
  agreed: 'Convenu pendant la réunion.',
  possibleDuplicate: 'Une tâche ConqrPlan semblable existe peut-être déjà : vérifiez avant de créer.',
  noProject: 'Aucun projet ConqrPlan n’est associé à l’espace de cette réunion : choisissez le projet.',
};

const EN_LABELS: ReportLabels = {
  keyPoints: 'Key points',
  openQuestions: 'Open questions',
  noActions: '- No explicit action items were agreed.',
  noDecisions: '- No decisions were recorded.',
  noNextSteps: '- No next steps were identified.',
  summary: 'Summary',
  decisions: 'Decisions',
  actionItems: 'Action items',
  nextSteps: 'Next steps',
  meetingNotes: 'Meeting notes',
  untitled: 'Untitled meeting',
  nothingRecorded: '_Nothing recorded._',
  sectionNotGenerated: '_Section not generated: run the analysis again._',
  noOwner: 'No owner was stated in the meeting.',
  lowConfidence: 'Low confidence — check the quoted evidence.',
  agreed: 'Agreed during the meeting.',
  possibleDuplicate: 'A similar ConqrPlan work item may already exist: check before creating.',
  noProject: 'No ConqrPlan project is mapped to this meeting’s space: choose the project.',
};

export function reportLabels(lang: ReportLanguage): ReportLabels {
  return lang === 'fr' ? FR_LABELS : EN_LABELS;
}

/** Every "nothing here" marker any version of the pipeline ever wrote. */
export const EMPTY_SECTION_MARKERS = new Set([
  FR_LABELS.nothingRecorded,
  EN_LABELS.nothingRecorded,
]);

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 64) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value.trim() });
    return true;
  } catch {
    return false;
  }
}

/** First valid IANA zone among the candidates, else the deployment's. */
export function resolveTimeZone(
  candidates: unknown[],
  fallback: string = deploymentTimeZone(),
): string {
  for (const candidate of candidates) {
    if (isValidTimeZone(candidate)) return (candidate as string).trim();
  }
  return fallback;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date and time with the zone's abbreviation, e.g.
 *  "13 octobre 2026 à 11 h 05 HAE" — never ambiguous across zones. */
export function formatMeetingDateTime(
  value: Date | string | null | undefined,
  timeZone: string,
  lang: ReportLanguage = 'fr',
): string | null {
  const d = toDate(value);
  if (!d) return null;
  const zone = resolveTimeZone([timeZone]);
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: zone,
  })
    .format(d)
    .concat(' ', zoneAbbreviation(d, zone, lang));
}

export function formatMeetingDate(
  value: Date | string | null | undefined,
  timeZone: string,
  lang: ReportLanguage = 'fr',
): string | null {
  const d = toDate(value);
  if (!d) return null;
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', {
    dateStyle: 'long',
    timeZone: resolveTimeZone([timeZone]),
  }).format(d);
}

function zoneAbbreviation(d: Date, timeZone: string, lang: ReportLanguage) {
  const part = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', {
    timeZone,
    timeZoneName: 'short',
  })
    .formatToParts(d)
    .find((p) => p.type === 'timeZoneName');
  return part?.value ?? timeZone;
}
