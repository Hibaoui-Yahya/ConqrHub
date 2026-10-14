import * as React from 'react';
import {
  Actions,
  Details,
  MailBody,
  Note,
  P,
  formatDateFr,
  greeting,
} from '../partials/partials';

interface Props {
  userName?: string;
  oldEmail: string;
  newEmail: string;
  changedAt: Date | string;
  /** Where to secure the account if the change was not wanted. */
  secureUrl?: string;
}

export const EmailChangedEmail = ({
  userName,
  oldEmail,
  newEmail,
  changedAt,
  secureUrl,
}: Props) => {
  return (
    <MailBody
      product="ai"
      icon="at-sign-warning"
      preview={`Les prochains e-mails partiront vers ${newEmail}.`}
      heading="Votre adresse e-mail a changé"
      reason="Cet e-mail de sécurité est envoyé à votre ancienne adresse. Il ne peut pas être désactivé."
      recipient={oldEmail}
    >
      <P>{greeting(userName)}</P>
      <P>
        L'adresse e-mail de votre compte a été modifiée. Nous écrivons à votre
        ancienne adresse pour vous prévenir.
      </P>
      <Details
        rows={[
          ['Ancienne adresse', oldEmail],
          ['Nouvelle adresse', newEmail],
          ['Date', `${formatDateFr(changedAt)} (Paris)`],
        ]}
      />
      {secureUrl && (
        <>
          <P>Ce n'était pas vous ? Sécurisez votre compte immédiatement.</P>
          <Actions href={secureUrl} label="Ce n'était pas moi" danger />
        </>
      )}
      <Note>
        Si vous ne pouvez plus vous connecter, contactez l'administrateur de
        votre espace : il peut rétablir votre adresse.
      </Note>
    </MailBody>
  );
};

export default EmailChangedEmail;
