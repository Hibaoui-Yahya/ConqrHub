import * as React from 'react';
import {
  Actions,
  Details,
  MailBody,
  MailLanguage,
  Note,
  P,
  formatMailDate,
  greeting,
  parisZoneLabel,
} from '../partials/partials';

interface Props {
  lang: MailLanguage;
  username?: string;
  changedAt?: Date | string;
  /** Where to secure the account (the forgot-password page). */
  secureUrl?: string;
  /** True when the other sessions were signed out by the change. */
  sessionsRevoked?: boolean;
  recipient?: string;
}

export const ChangePasswordEmail = ({
  lang,
  username,
  changedAt,
  secureUrl,
  sessionsRevoked = true,
  recipient,
}: Props) => {
  const when = changedAt
    ? `${formatMailDate(changedAt, lang)} ${parisZoneLabel(lang)}`
    : null;
  if (lang === 'fr') {
    return (
      <MailBody
        lang={lang}
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
        <P>{greeting(username, lang)}</P>
        <P>
          Le mot de passe de votre compte vient d'être modifié.
          {sessionsRevoked
            ? ' Par sécurité, vos autres sessions ont été déconnectées.'
            : ''}
        </P>
        <Details rows={[['Date', when]]} />
        {secureUrl && (
          <>
            <P>Ce n'était pas vous ? Sécurisez votre compte immédiatement.</P>
            <Actions href={secureUrl} label="Sécuriser mon compte" danger />
          </>
        )}
        <Note>
          ConqrAI ne vous demandera jamais votre mot de passe par e-mail ou par
          téléphone. En cas de doute, contactez l'administrateur de votre
          espace.
        </Note>
      </MailBody>
    );
  }
  return (
    <MailBody
      lang={lang}
      product="ai"
      icon="shield-check-success"
      preview={
        sessionsRevoked
          ? 'Your other sessions were signed out for security.'
          : "If you didn't make this change, secure your account."
      }
      heading="Your password has been changed"
      recipient={recipient}
    >
      <P>{greeting(username, lang)}</P>
      <P>
        The password of your account has just been changed.
        {sessionsRevoked
          ? ' For security, your other sessions have been signed out.'
          : ''}
      </P>
      <Details rows={[['Date', when]]} />
      {secureUrl && (
        <>
          <P>Wasn't you? Secure your account right away.</P>
          <Actions href={secureUrl} label="Secure my account" danger />
        </>
      )}
      <Note>
        ConqrAI will never ask for your password by e-mail or phone. If in
        doubt, contact your workspace administrator.
      </Note>
    </MailBody>
  );
};

export default ChangePasswordEmail;
