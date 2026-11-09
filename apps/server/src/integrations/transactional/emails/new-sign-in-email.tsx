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
  deviceName?: string;
  ipAddress?: string;
  signedInAt: Date | string;
  /** Where to secure the account (forgot-password page). */
  secureUrl?: string;
  recipient?: string;
}

/** Hides the last two parts of an IPv4 address, or the end of an IPv6 one. */
export function maskIp(ip?: string): string | undefined {
  if (!ip) return undefined;
  const v4 = ip.replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) {
    const [a, b] = v4.split('.');
    return `${a}.${b}.xxx.xxx`;
  }
  const parts = ip.split(':').filter(Boolean);
  return parts.length > 2 ? `${parts.slice(0, 3).join(':')}:…` : ip;
}

export const NewSignInEmail = ({
  lang,
  userName,
  deviceName,
  ipAddress,
  signedInAt,
  secureUrl,
  recipient,
}: Props) => {
  const when = formatMailDate(signedInAt, lang);
  // Device names are written in English ("Firefox on Linux").
  const device =
    lang === 'fr' ? deviceName?.replace(/ on /g, ' sur ') : deviceName;
  if (lang === 'fr') {
    return (
      <MailBody
        lang={lang}
        product="ai"
        icon="log-in-warning"
        preview={[device, when].filter(Boolean).join(' · ')}
        heading="Nouvelle connexion détectée"
        recipient={recipient}
      >
        <P>{greeting(userName, lang)}</P>
        <P>
          Votre compte vient d'être utilisé depuis un nouvel appareil. Si
          c'était vous, aucune action n'est nécessaire.
        </P>
        <Details
          rows={[
            ['Appareil', device],
            ['Adresse IP', maskIp(ipAddress)],
            ['Date', `${when} ${parisZoneLabel(lang)}`],
          ]}
        />
        {secureUrl && (
          <Actions href={secureUrl} label="Ce n'était pas moi" danger />
        )}
        <Note>
          Ce bouton vous permet de choisir un nouveau mot de passe, ce qui
          déconnecte toutes vos sessions. ConqrAI ne vous demandera jamais votre
          mot de passe par e-mail.
        </Note>
      </MailBody>
    );
  }
  return (
    <MailBody
      lang={lang}
      product="ai"
      icon="log-in-warning"
      preview={[device, when].filter(Boolean).join(' · ')}
      heading="New sign-in detected"
      recipient={recipient}
    >
      <P>{greeting(userName, lang)}</P>
      <P>
        Your account was just used from a new device. If this was you, no
        action is needed.
      </P>
      <Details
        rows={[
          ['Device', device],
          ['IP address', maskIp(ipAddress)],
          ['Date', `${when} ${parisZoneLabel(lang)}`],
        ]}
      />
      {secureUrl && (
        <Actions href={secureUrl} label="This wasn't me" danger />
      )}
      <Note>
        This button lets you choose a new password, which signs out all your
        sessions. ConqrAI will never ask for your password by e-mail.
      </Note>
    </MailBody>
  );
};

export default NewSignInEmail;
