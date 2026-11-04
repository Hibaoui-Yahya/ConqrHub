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
  userName?: string;
  oldEmail: string;
  newEmail: string;
  changedAt: Date | string;
  /** Where to secure the account if the change was not wanted. */
  secureUrl?: string;
}

export const EmailChangedEmail = ({
  lang,
  userName,
  oldEmail,
  newEmail,
  changedAt,
  secureUrl,
}: Props) => {
  const when = `${formatMailDate(changedAt, lang)} ${parisZoneLabel(lang)}`;
  if (lang === 'fr') {
    return (
      <MailBody
        lang={lang}
        product="ai"
        icon="at-sign-warning"
        preview={`Les prochains e-mails partiront vers ${newEmail}.`}
        heading="Votre adresse e-mail a changé"
        reason="Cet e-mail de sécurité est envoyé à votre ancienne adresse. Il ne peut pas être désactivé."
        recipient={oldEmail}
      >
        <P>{greeting(userName, lang)}</P>
        <P>
          L'adresse e-mail de votre compte a été modifiée. Nous écrivons à votre
          ancienne adresse pour vous prévenir.
        </P>
        <Details
          rows={[
            ['Ancienne adresse', oldEmail],
            ['Nouvelle adresse', newEmail],
            ['Date', when],
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
  }
  return (
    <MailBody
      lang={lang}
      product="ai"
      icon="at-sign-warning"
      preview={`Future e-mails will go to ${newEmail}.`}
      heading="Your e-mail address has changed"
      reason="This security e-mail is sent to your previous address. It cannot be turned off."
      recipient={oldEmail}
    >
      <P>{greeting(userName, lang)}</P>
      <P>
        The e-mail address of your account has been changed. We are writing to
        your previous address to let you know.
      </P>
      <Details
        rows={[
          ['Previous address', oldEmail],
          ['New address', newEmail],
          ['Date', when],
        ]}
      />
      {secureUrl && (
        <>
          <P>Wasn't you? Secure your account right away.</P>
          <Actions href={secureUrl} label="This wasn't me" danger />
        </>
      )}
      <Note>
        If you can no longer sign in, contact your workspace administrator:
        they can restore your address.
      </Note>
    </MailBody>
  );
};

export default EmailChangedEmail;
