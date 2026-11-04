import * as React from 'react';
import {
  Actions,
  FallbackLink,
  MailBody,
  MailLanguage,
  Note,
  P,
  greeting,
} from '../partials/partials';

interface Props {
  lang: MailLanguage;
  username: string;
  resetLink: string;
  /** Lifetime of the link, in minutes. */
  validMinutes?: number;
  recipient?: string;
}

export const ForgotPasswordEmail = ({
  lang,
  username,
  resetLink,
  validMinutes = 30,
  recipient,
}: Props) => {
  if (lang === 'fr') {
    return (
      <MailBody
        lang={lang}
        product="ai"
        icon="key-round-brand"
        preview={`Ce lien est valable ${validMinutes} minutes et ne sert qu'une fois.`}
        heading="Réinitialisez votre mot de passe"
        recipient={recipient}
      >
        <P>{greeting(username, lang)}</P>
        <P>
          Nous avons reçu une demande de réinitialisation du mot de passe de
          votre compte. Choisissez-en un nouveau avec le bouton ci-dessous. Ce
          lien est valable {validMinutes} minutes et ne sert qu'une fois.
        </P>
        <Actions href={resetLink} label="Choisir un nouveau mot de passe" />
        <FallbackLink href={resetLink} lang={lang} />
        <Note>
          Vous n'avez rien demandé ? Ignorez cet e-mail : votre mot de passe
          actuel reste valable. Ne transférez jamais ce lien.
        </Note>
      </MailBody>
    );
  }
  return (
    <MailBody
      lang={lang}
      product="ai"
      icon="key-round-brand"
      preview={`This link is valid for ${validMinutes} minutes and works only once.`}
      heading="Reset your password"
      recipient={recipient}
    >
      <P>{greeting(username, lang)}</P>
      <P>
        We received a request to reset the password of your account. Choose a
        new one with the button below. This link is valid for {validMinutes}{' '}
        minutes and works only once.
      </P>
      <Actions href={resetLink} label="Choose a new password" />
      <FallbackLink href={resetLink} lang={lang} />
      <Note>
        Didn't ask for anything? Ignore this e-mail: your current password
        remains valid. Never forward this link.
      </Note>
    </MailBody>
  );
};

export default ForgotPasswordEmail;
