import * as React from 'react';
import {
  Actions,
  B,
  Details,
  MailBody,
  P,
  greeting,
} from '../partials/partials';

interface Props {
  invitedUserName: string;
  invitedUserEmail: string;
  inviterName?: string;
  workspaceName?: string;
  roleLabel?: string;
  membersUrl?: string;
  recipient?: string;
}

export const InvitationAcceptedEmail = ({
  invitedUserName,
  invitedUserEmail,
  inviterName,
  workspaceName,
  roleLabel,
  membersUrl,
  recipient,
}: Props) => {
  const who = invitedUserName || invitedUserEmail;
  return (
    <MailBody
      product="ai"
      icon="user-check-success"
      preview="Votre invitation a été acceptée, ses accès sont prêts."
      heading={`${who} a rejoint l'espace`}
      reason="Vous recevez cet e-mail parce que vous avez envoyé cette invitation."
      recipient={recipient}
    >
      <P>{greeting(inviterName)}</P>
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
};

export default InvitationAcceptedEmail;
