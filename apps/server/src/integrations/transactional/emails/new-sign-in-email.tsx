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
  userName,
  deviceName,
  ipAddress,
  signedInAt,
  secureUrl,
  recipient,
}: Props) => {
  const when = formatDateFr(signedInAt);
  return (
    <MailBody
      product="ai"
      icon="log-in-warning"
      preview={[deviceName?.replace(/ on /g, ' sur '), when]
        .filter(Boolean)
        .join(' · ')}
      heading="Nouvelle connexion détectée"
      recipient={recipient}
    >
      <P>{greeting(userName)}</P>
      <P>
        Votre compte vient d'être utilisé depuis un nouvel appareil. Si c'était
        vous, aucune action n'est nécessaire.
      </P>
      <Details
        rows={[
          ['Appareil', deviceName?.replace(/ on /g, ' sur ')],
          ['Adresse IP', maskIp(ipAddress)],
          ['Date', `${when} (Paris)`],
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
};

export default NewSignInEmail;
