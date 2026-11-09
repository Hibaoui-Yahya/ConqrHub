import type { UiLanguage } from './ui-language';

/**
 * User-facing server messages that were written in French (the La Tête
 * Chercheuse deployment), with their English text for accounts in any other
 * language.
 *
 * The services keep throwing (and storing) the French text, so French
 * accounts see exactly what they saw before and the specs that assert it
 * still hold. LocalizedExceptionFilter and LocalizedMessagesInterceptor
 * translate them on the way out, from the reader's account language.
 *
 * `{name}` is a placeholder: the French text is matched as a whole, and what
 * the placeholder covered is copied into the English text.
 *
 * When you add or reword a French message a person can see, add or update
 * its entry here; server-messages.spec.ts checks the shared constants.
 */
const CATALOG: Array<{ fr: string; en: string }> = [
  // Meeting access and sharing (meeting-access.util.ts, meeting-share.service.ts)
  {
    fr: 'Lecture seule : seule la personne qui a créé cette réunion peut la modifier.',
    en: 'Read only: only the person who created this meeting can change it.',
  },
  {
    fr: 'La publication dans ConqrHub est suspendue pendant la mise en place du partage privé des réunions.',
    en: 'Publishing to ConqrHub is suspended while private meeting sharing is being set up.',
  },
  {
    fr: 'Seuls les propriétaires et les administrateurs peuvent changer le modèle par défaut de l’entreprise.',
    en: "Only owners and admins can change the company's default template.",
  },
  {
    fr: 'Lecture seule : seules la personne qui a créé ce modèle, les propriétaires et les administrateurs peuvent le modifier.',
    en: 'Read only: only the person who created this template, owners and admins can change it.',
  },
  {
    fr: 'Au plus {count} personnes ou groupes à la fois.',
    en: 'At most {count} people or groups at a time.',
  },
  {
    fr: 'Partage impossible : certaines personnes ou certains groupes ne peuvent pas recevoir cette réunion.',
    en: 'Sharing failed: some people or groups cannot receive this meeting.',
  },
  {
    fr: 'Choisissez au moins une personne ou un groupe.',
    en: 'Choose at least one person or group.',
  },
  { fr: 'Partage introuvable.', en: 'Share not found.' },

  // Pages derived from meetings (meeting-derived-pages.ts)
  {
    fr: 'Cette page provient d’une réunion ConqrMeet : sa suppression définitive est suspendue jusqu’à la revue de conservation.',
    en: 'This page comes from a ConqrMeet meeting: its permanent deletion is suspended until the retention review.',
  },

  // Invitations (invitation-expiry.ts)
  {
    fr: 'Cette invitation a expiré. Demandez à un administrateur de vous la renvoyer.',
    en: 'This invitation has expired. Ask an administrator to send it again.',
  },

  // Knowledge base (embeddings-admin.controller.ts)
  {
    fr: 'Seuls les propriétaires et les administrateurs peuvent réindexer les connaissances de leur entreprise.',
    en: "Only owners and admins can reindex their company's knowledge.",
  },

  // Audio capture (meeting.controller.ts, meeting.service.ts)
  {
    fr: 'Le champ languageConfig doit être un objet JSON, par exemple {"language":"fr"}.',
    en: 'The languageConfig field must be a JSON object, for example {"language":"fr"}.',
  },
  {
    fr: 'Ce morceau audio dépasse 150 Mo : envoyez des morceaux plus courts.',
    en: 'This audio chunk is larger than 150 MB: send shorter chunks.',
  },
  { fr: 'Le morceau audio n’a pas pu être lu.', en: 'The audio chunk could not be read.' },
  { fr: 'Aucun fichier audio dans la requête.', en: 'No audio file in the request.' },
  { fr: 'Le morceau audio est vide.', en: 'The audio chunk is empty.' },
  {
    fr: 'Le morceau 0 d’une source doit contenir l’en-tête audio : il ne peut pas être une suite.',
    en: 'Chunk 0 of a source must contain the audio header: it cannot be a continuation.',
  },
  {
    fr: 'Le morceau {sequence} ({source}) est déjà enregistré avec un autre contenu. Reprenez la numérotation à partir de la capture enregistrée.',
    en: 'Chunk {sequence} ({source}) is already stored with different content. Resume the numbering from the stored capture.',
  },
  {
    fr: 'Cet enregistrement compte déjà {count} morceaux pour cette source : envoyez des morceaux plus longs ou arrêtez l’enregistrement.',
    en: 'This recording already has {count} chunks for this source: send longer chunks or stop the recording.',
  },
  {
    fr: 'La durée maximale d’un enregistrement ({duration}) est atteinte : arrêtez l’enregistrement pour lancer le traitement.',
    en: 'The maximum length of a recording ({duration}) has been reached: stop the recording to start processing.',
  },
  {
    fr: 'La taille maximale de l’audio d’une réunion ({size} Mo) est atteinte : arrêtez l’enregistrement pour lancer le traitement.',
    en: 'The maximum audio size of a meeting ({size} MB) has been reached: stop the recording to start processing.',
  },
  {
    fr: 'Ce morceau est une suite, mais aucun morceau avec en-tête audio ne le précède pour cette source.',
    en: 'This chunk is a continuation, but no chunk with an audio header precedes it for this source.',
  },
  {
    fr: 'Des morceaux de l’enregistrement ne sont pas encore arrivés. Renvoyez-les avant d’arrêter, ou arrêtez quand même en acceptant de perdre ces passages.',
    en: 'Some chunks of the recording have not arrived yet. Send them again before stopping, or stop anyway and accept losing those passages.',
  },

  // Meeting list and lifecycle (meeting.service.ts)
  {
    fr: 'Statut inconnu : « {status} ».',
    en: 'Unknown status: “{status}”.',
  },
  { fr: 'Identifiant de personne invalide.', en: 'Invalid person identifier.' },
  {
    fr: 'Période invalide : « from » doit précéder « to ».',
    en: 'Invalid period: “from” must come before “to”.',
  },
  {
    fr: 'Cette réunion est en cours d’enregistrement ou de traitement : archivez-la quand le traitement sera terminé.',
    en: 'This meeting is being recorded or processed: archive it once processing is finished.',
  },
  {
    fr: 'Cette réunion est archivée : désarchivez-la avant de la traiter ou de la publier.',
    en: 'This meeting is archived: unarchive it before processing or publishing it.',
  },

  // Saved insights (meeting-insights.util.ts, meeting.service.ts)
  {
    fr: 'Type d’élément inconnu : « communication-analysis » ou « qa » attendu.',
    en: 'Unknown item type: “communication-analysis” or “qa” expected.',
  },
  { fr: 'Le contenu à enregistrer est vide.', en: 'The content to save is empty.' },
  {
    fr: 'Le contenu dépasse {count} caractères.',
    en: 'The content exceeds {count} characters.',
  },
  {
    fr: 'La question est obligatoire pour enregistrer une réponse.',
    en: 'The question is required to save an answer.',
  },
  {
    fr: 'La question dépasse {count} caractères.',
    en: 'The question exceeds {count} characters.',
  },
  {
    fr: 'Cette réunion compte déjà {count} éléments enregistrés : supprimez-en avant d’en ajouter.',
    en: 'This meeting already has {count} saved items: delete some before adding more.',
  },
  { fr: 'Élément introuvable.', en: 'Item not found.' },

  // Processing (meeting.service.ts, meeting-processing.util.ts)
  {
    fr: 'La file de traitement ne répond pas pour le moment. Réessayez dans quelques minutes.',
    en: 'The processing queue is not responding right now. Try again in a few minutes.',
  },
  {
    fr: 'Le traitement de cette réunion est déjà en cours. Patientez quelques minutes.',
    en: 'This meeting is already being processed. Wait a few minutes.',
  },
  {
    fr: 'Le traitement progresse encore. La relance devient possible s’il reste bloqué plus de 15 minutes.',
    en: 'Processing is still progressing. Restarting becomes possible if it stays stuck for more than 15 minutes.',
  },
  {
    fr: 'Il n’y a pas de traitement à relancer pour cette réunion.',
    en: 'There is no processing to restart for this meeting.',
  },
  {
    fr: 'Aucun audio n’est enregistré pour cette réunion : il n’y a rien à traiter.',
    en: 'No audio is recorded for this meeting: there is nothing to process.',
  },
  {
    fr: 'Un intervenant ne peut être associé qu’à un membre actif de l’entreprise. Choisissez la personne dans la liste des membres.',
    en: 'A speaker can only be linked to an active member of the company. Choose the person from the member list.',
  },
  {
    fr: 'Le traitement de cette réunion est en cours. Confirmez les intervenants quand il sera terminé.',
    en: 'This meeting is being processed. Confirm the speakers once it is finished.',
  },
  {
    fr: 'Le traitement de cette réunion n’est pas terminé. Publiez-la quand l’analyse sera prête.',
    en: 'Processing of this meeting is not finished. Publish it once the analysis is ready.',
  },
  {
    fr: 'Une nouvelle tentative est programmée après une erreur passagère.',
    en: 'A new attempt is scheduled after a temporary error.',
  },
  { fr: 'Le traitement est en file d’attente.', en: 'Processing is queued.' },
  {
    fr: 'Le consentement à l’enregistrement n’a pas été confirmé pour cette réunion : elle ne peut pas être traitée.',
    en: 'Consent to recording has not been confirmed for this meeting: it cannot be processed.',
  },
  {
    fr: 'Le consentement à l’enregistrement n’a pas été confirmé : le traitement n’a pas été lancé.',
    en: 'Consent to recording has not been confirmed: processing was not started.',
  },
  {
    fr: 'Aucun audio n’est disponible pour cette réunion : enregistrez ou téléversez l’audio, puis relancez.',
    en: 'No audio is available for this meeting: record or upload the audio, then restart.',
  },
  {
    fr: 'Aucun son n’a été capté : toutes les sources de cet enregistrement sont silencieuses (silence numérique). Il n’y a rien à transcrire ; les fichiers sont conservés.',
    en: 'No sound was captured: every source of this recording is silent (digital silence). There is nothing to transcribe; the files are kept.',
  },
  {
    fr: 'La transcription est vide : aucune parole n’a été détectée dans l’enregistrement. Vérifiez le micro et la source audio, puis réessayez.',
    en: 'The transcript is empty: no speech was detected in the recording. Check the microphone and the audio source, then try again.',
  },
  {
    fr: 'Le traitement de cette réunion est en cours. Retirez les doublons quand il sera terminé.',
    en: 'This meeting is being processed. Remove the duplicates once it is finished.',
  },
  {
    fr: 'La transcription a changé entre-temps. Rechargez la page, puis réessayez.',
    en: 'The transcript has changed in the meantime. Reload the page, then try again.',
  },
  {
    fr: 'Le traitement a dépassé la durée maximale autorisée.',
    en: 'Processing exceeded the maximum time allowed.',
  },
  // Stored failure reasons: a fixed sentence, then " Détail : <cause>".
  {
    fr: 'Le traitement s’est interrompu (redémarrage du service ou délai dépassé). L’audio est conservé : relancez le traitement. Détail : {detail}',
    en: 'Processing was interrupted (service restart or time limit exceeded). The audio is kept: restart the processing. Detail: {detail}',
  },
  {
    fr: 'Le traitement s’est interrompu (redémarrage du service ou délai dépassé). L’audio est conservé : relancez le traitement.',
    en: 'Processing was interrupted (service restart or time limit exceeded). The audio is kept: restart the processing.',
  },
  {
    fr: 'Le traitement a échoué après plusieurs tentatives. L’audio est conservé : relancez le traitement. Détail : {detail}',
    en: 'Processing failed after several attempts. The audio is kept: restart the processing. Detail: {detail}',
  },
  {
    fr: 'Le traitement a échoué après plusieurs tentatives. L’audio est conservé : relancez le traitement.',
    en: 'Processing failed after several attempts. The audio is kept: restart the processing.',
  },
  { fr: 'Le traitement a échoué. Détail : {detail}', en: 'Processing failed. Detail: {detail}' },
  { fr: 'Le traitement a échoué.', en: 'Processing failed.' },
  { fr: 'Traitement impossible.', en: 'Processing is not possible.' },

  // Generated documents (meeting.service.ts, meeting-template.util.ts)
  {
    fr: 'Le compte rendu « {name} » n’a pas pu être généré : la réponse de l’IA était inutilisable après {attempts} tentatives. La transcription et le résumé restent disponibles ; relancez l’analyse.',
    en: 'The “{name}” minutes could not be generated: the AI response was unusable after {attempts} attempts. The transcript and the summary remain available; restart the analysis.',
  },
  {
    fr: 'Le compte rendu « {name} » est revenu vide alors que la transcription contient des échanges : il n’a pas été enregistré. Relancez l’analyse.',
    en: 'The “{name}” minutes came back empty although the transcript contains exchanges: they were not saved. Restart the analysis.',
  },
  {
    fr: 'Le compte rendu « {name} » est incomplet : {count} section(s) n’ont pas pu être générées ({sections}). Il ne sera pas publié tant que l’analyse n’aura pas été relancée.',
    en: 'The “{name}” minutes are incomplete: {count} section(s) could not be generated ({sections}). They will not be published until the analysis is restarted.',
  },
  {
    fr: 'Ce document n’a pas pu être généré. Relancez l’analyse avant de le publier.',
    en: 'This document could not be generated. Restart the analysis before publishing it.',
  },
  {
    fr: 'Ce compte rendu est incomplet : certaines sections n’ont pas pu être générées. Relancez l’analyse avant de le publier.',
    en: 'These minutes are incomplete: some sections could not be generated. Restart the analysis before publishing them.',
  },
  {
    fr: 'Ce compte rendu ne contient aucune section remplie, ce qui indique une génération ratée. Relancez l’analyse avant de le publier.',
    en: 'These minutes contain no filled section, which points to a failed generation. Restart the analysis before publishing them.',
  },
];

interface CompiledEntry {
  pattern: RegExp;
  en: string;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compile(fr: string, en: string): CompiledEntry {
  let source = '';
  let last = 0;
  for (const m of fr.matchAll(/\{(\w+)\}/g)) {
    source += escapeRegExp(fr.slice(last, m.index));
    source += `(?<${m[1]}>[\\s\\S]+?)`;
    last = (m.index ?? 0) + m[0].length;
  }
  source += escapeRegExp(fr.slice(last));
  return { pattern: new RegExp(`^${source}$`), en };
}

// Longest French text first, so a sentence with a " Détail : …" tail is
// matched by its own entry before the shorter one.
const COMPILED: CompiledEntry[] = [...CATALOG]
  .sort((a, b) => b.fr.length - a.fr.length)
  .map(({ fr, en }) => compile(fr, en));

/**
 * The text a reader in `lang` sees. French readers, and messages that are
 * not in the catalogue (already English, or unknown), are returned as is.
 */
export function translateServerMessage(message: string, lang: UiLanguage): string {
  if (lang === 'fr' || typeof message !== 'string' || !message) return message;
  const text = message.trim();
  for (const { pattern, en } of COMPILED) {
    const m = pattern.exec(text);
    if (!m) continue;
    const groups = m.groups ?? {};
    return en.replace(/\{(\w+)\}/g, (all, name: string) => {
      if (!(name in groups)) return all;
      // A cause can itself be a known sentence (a timeout, for instance).
      return name === 'detail'
        ? translateServerMessage(groups[name], lang)
        : groups[name];
    });
  }
  return message;
}

/** Every French text of the catalogue (for specs). */
export function serverMessageCatalog(): ReadonlyArray<{ fr: string; en: string }> {
  return CATALOG;
}
