import * as React from 'react';
import {
  Actions,
  B,
  Details,
  ItemList,
  MailBody,
  Note,
  P,
  greeting,
} from '../partials/partials';

export interface MeetingProposalItem {
  title: string;
  meta?: string;
}

interface Props {
  userName?: string;
  meetingTitle: string;
  meetingUrl: string;
  startedAt?: string;
  durationLabel?: string;
  /** Action proposals waiting for a decision (nothing is created without it). */
  proposals?: MeetingProposalItem[];
  /** True when the report could not be generated (partially failed). */
  partial?: boolean;
}

export const MeetingReadyEmail = ({
  userName,
  meetingTitle,
  meetingUrl,
  startedAt,
  durationLabel,
  proposals = [],
  partial,
}: Props) => {
  const n = proposals.length;
  const shown = proposals.slice(0, 6);
  return (
    <MailBody
      product="meet"
      icon={n ? 'list-checks-brand' : 'sparkles-brand'}
      preview={
        n
          ? `${n} action${n > 1 ? 's' : ''} proposée${n > 1 ? 's' : ''} à valider.`
          : 'Transcription et compte rendu disponibles.'
      }
      heading={
        partial
          ? 'Votre transcription est prête'
          : 'Votre compte rendu est prêt'
      }
    >
      <P>{greeting(userName)}</P>
      <P>
        {partial ? 'La transcription' : 'Le compte rendu'} de la réunion{' '}
        <B>« {meetingTitle} »</B> est disponible.
        {partial
          ? " Le compte rendu n'a pas pu être généré : vous pouvez le relancer depuis la réunion."
          : ''}
      </P>
      <Details
        rows={[
          ['Date', startedAt],
          ['Durée', durationLabel],
        ]}
      />
      {n > 0 && (
        <>
          <P>
            L'IA a repéré {n === 1 ? 'une action' : `${n} actions`} dans cette
            réunion. Validez, modifiez ou écartez chacune : seules les actions
            validées deviennent des tâches ConqrPlan.
          </P>
          <ItemList numbered items={shown} />
          {n > shown.length && (
            <P>
              Et {n - shown.length} autre{n - shown.length > 1 ? 's' : ''}.
            </P>
          )}
        </>
      )}
      <Actions
        href={meetingUrl}
        label={n ? 'Valider les actions' : 'Ouvrir le compte rendu'}
      />
      <Note>
        Ce compte rendu est généré par IA à partir de la transcription.
        Relisez-le avant de le partager.
      </Note>
    </MailBody>
  );
};

export default MeetingReadyEmail;
