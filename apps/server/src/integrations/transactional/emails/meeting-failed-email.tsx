import * as React from 'react';
import {
  Actions,
  B,
  Details,
  MailBody,
  Note,
  P,
  greeting,
} from '../partials/partials';

interface Props {
  userName?: string;
  meetingTitle: string;
  meetingUrl: string;
  startedAt?: string;
  failureReason?: string | null;
  /** Short reference for support, e.g. the first block of the meeting id. */
  reference?: string;
}

export const MeetingFailedEmail = ({
  userName,
  meetingTitle,
  meetingUrl,
  startedAt,
  failureReason,
  reference,
}: Props) => {
  return (
    <MailBody
      product="meet"
      icon="triangle-alert-danger"
      preview="Votre enregistrement est conservé. Vous pouvez relancer le traitement."
      heading="Nous n'avons pas pu traiter l'enregistrement"
    >
      <P>{greeting(userName)}</P>
      <P>
        L'enregistrement de la réunion <B>« {meetingTitle} »</B> n'a pas pu être
        traité. Le fichier audio est conservé : relancez le traitement ou
        importez un autre fichier depuis la réunion.
      </P>
      <Details
        rows={[
          ['Réunion', meetingTitle],
          ['Date', startedAt],
          ['Cause', failureReason || undefined],
        ]}
      />
      <Actions href={meetingUrl} label="Ouvrir la réunion" />
      <Note>
        Le problème persiste ? Contactez le support
        {reference ? ` avec la référence ${reference}` : ''}.
      </Note>
    </MailBody>
  );
};

export default MeetingFailedEmail;
