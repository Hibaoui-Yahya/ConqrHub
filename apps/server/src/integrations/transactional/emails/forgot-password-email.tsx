import * as React from 'react';
import {
  Actions,
  FallbackLink,
  MailBody,
  Note,
  P,
  greeting,
} from '../partials/partials';

interface Props {
  username: string;
  resetLink: string;
  /** Lifetime of the link, in minutes. */
  validMinutes?: number;
  recipient?: string;
}

export const ForgotPasswordEmail = ({
  username,
  resetLink,
  validMinutes = 30,
  recipient,
}: Props) => {
  return (
    <MailBody
      product="ai"
      icon="key-round-brand"
      preview={`Ce lien est valable ${validMinutes} minutes et ne sert qu'une fois.`}
      heading="Réinitialisez votre mot de passe"
      recipient={recipient}
    >
      <P>{greeting(username)}</P>
      <P>
        Nous avons reçu une demande de réinitialisation du mot de passe de votre
        compte. Choisissez-en un nouveau avec le bouton ci-dessous. Ce lien est
        valable {validMinutes} minutes et ne sert qu'une fois.
      </P>
      <Actions href={resetLink} label="Choisir un nouveau mot de passe" />
      <FallbackLink href={resetLink} />
      <Note>
        Vous n'avez rien demandé ? Ignorez cet e-mail : votre mot de passe
        actuel reste valable. Ne transférez jamais ce lien.
      </Note>
    </MailBody>
  );
};

export default ForgotPasswordEmail;
