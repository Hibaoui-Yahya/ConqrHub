import * as React from 'react';
import {
  Actions,
  B,
  Details,
  MailBody,
  MailLanguage,
  P,
  greeting,
} from '../partials/partials';

interface Props {
  lang: MailLanguage;
  invitedUserName: string;
  invitedUserEmail: string;
  inviterName?: string;
  workspaceName?: string;
  roleLabel?: string;
  membersUrl?: string;
  recipient?: string;
}

export const InvitationAcceptedEmail = ({
  lang,
  invitedUserName,
  invitedUserEmail,
  inviterName,
  workspaceName,
  roleLabel,
  membersUrl,
  recipient,
}: Props) => {
  const who = invitedUserName || invitedUserEmail;
  if (lang === 'fr') {
    return (
      <MailBody
        lang={lang}
        product="ai"
        icon="user-check-success"
        preview="Votre invitation a été acceptée, ses accès sont prêts."
        heading={`${who} a rejoint l'espace`}
        reason="Vous recevez cet e-mail parce que vous avez envoyé cette invitation."
        recipient={recipient}
      >
        <P>{greeting(inviterName, lang)}</P>
        <P>
          Bonne nouvelle : <B>{who}</B> a accepté votre invitation
          {workspaceName ? (
            <>
              {' '}
              à rejoindre <B>{workspaceName}</B>
            </>
          ) : null}
          . Son compte est actif et ses accès sont prêts.
        </P>
        <Details
          rows={[
            ['Nom', invitedUserName],
            ['E-mail', invitedUserEmail],
            ['Rôle', roleLabel],
          ]}
        />
        {membersUrl && <Actions href={membersUrl} label="Voir les membres" />}
      </MailBody>
    );
  }
  return (
    <MailBody
      lang={lang}
      product="ai"
      icon="user-check-success"
      preview="Your invitation was accepted, their access is ready."
      heading={`${who} joined the workspace`}
      reason="You are receiving this e-mail because you sent this invitation."
      recipient={recipient}
    >
      <P>{greeting(inviterName, lang)}</P>
      <P>
        Good news: <B>{who}</B> accepted your invitation
        {workspaceName ? (
          <>
            {' '}
            to join <B>{workspaceName}</B>
          </>
        ) : null}
        . Their account is active and their access is ready.
      </P>
      <Details
        rows={[
          ['Name', invitedUserName],
          ['E-mail', invitedUserEmail],
          ['Role', roleLabel],
        ]}
      />
      {membersUrl && <Actions href={membersUrl} label="View members" />}
    </MailBody>
  );
};

export default InvitationAcceptedEmail;
