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
  username?: string;
  changedAt?: Date | string;
  /** Where to secure the account (the forgot-password page). */
  secureUrl?: string;
  /** True when the other sessions were signed out by the change. */
  sessionsRevoked?: boolean;
  recipient?: string;
}

export const ChangePasswordEmail = ({
  username,
  changedAt,
  secureUrl,
  sessionsRevoked = true,
  recipient,
}: Props) => {
  return (
    <MailBody
      product="ai"
      icon="shield-check-success"
      preview={
        sessionsRevoked
          ? 'Vos autres sessions ont été déconnectées par sécurité.'
          : "Si vous n'êtes pas à l'origine de ce changement, sécurisez votre compte."
      }
      heading="Votre mot de passe a été modifié"
      recipient={recipient}
    >
      <P>{greeting(username)}</P>
      <P>
        Le mot de passe de votre compte vient d'être modifié.
        {sessionsRevoked
          ? ' Par sécurité, vos autres sessions ont été déconnectées.'
          : ''}
      </P>
      <Details
        rows={[
          ['Date', changedAt ? `${formatDateFr(changedAt)} (Paris)` : null],
        ]}
      />
      {secureUrl && (
        <>
          <P>Ce n'était pas vous ? Sécurisez votre compte immédiatement.</P>
          <Actions href={secureUrl} label="Sécuriser mon compte" danger />
        </>
      )}
      <Note>
        ConqrAI ne vous demandera jamais votre mot de passe par e-mail ou par
        téléphone. En cas de doute, contactez l'administrateur de votre espace.
      </Note>
    </MailBody>
  );
};

export default ChangePasswordEmail;
