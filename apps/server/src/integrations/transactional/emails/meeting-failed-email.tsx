import * as React from 'react';
import {
  Actions,
  B,
  Details,
  MailBody,
  MailLanguage,
  Note,
  P,
  greeting,
} from '../partials/partials';

interface Props {
  lang: MailLanguage;
  userName?: string;
  meetingTitle: string;
  meetingUrl: string;
  startedAt?: string;
  failureReason?: string | null;
  /** Short reference for support, e.g. the first block of the meeting id. */
  reference?: string;
}

export const MeetingFailedEmail = ({
  lang,
  userName,
  meetingTitle,
  meetingUrl,
  startedAt,
  failureReason,
  reference,
}: Props) => {
  if (lang === 'fr') {
    return (
      <MailBody
        lang={lang}
        product="meet"
        icon="triangle-alert-danger"
        preview="Votre enregistrement est conservé. Vous pouvez relancer le traitement."
        heading="Nous n'avons pas pu traiter l'enregistrement"
      >
        <P>{greeting(userName, lang)}</P>
        <P>
          L'enregistrement de la réunion <B>« {meetingTitle} »</B> n'a pas pu
          être traité. Le fichier audio est conservé : relancez le traitement ou
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
  }
  return (
    <MailBody
      lang={lang}
      product="meet"
      icon="triangle-alert-danger"
      preview="Your recording is kept. You can restart the processing."
      heading="We couldn't process the recording"
    >
      <P>{greeting(userName, lang)}</P>
      <P>
        The recording of the meeting <B>“{meetingTitle}”</B> could not be
        processed. The audio file is kept: restart the processing or import
        another file from the meeting.
      </P>
      <Details
        rows={[
          ['Meeting', meetingTitle],
          ['Date', startedAt],
          ['Cause', failureReason || undefined],
        ]}
      />
      <Actions href={meetingUrl} label="Open the meeting" />
      <Note>
        Still having the problem? Contact support
        {reference ? ` with the reference ${reference}` : ''}.
      </Note>
    </MailBody>
  );
};

export default MeetingFailedEmail;
