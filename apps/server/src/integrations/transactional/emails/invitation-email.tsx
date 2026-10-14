import * as React from 'react';
import {
  Actions,
  B,
  FallbackLink,
  ItemList,
  MailBody,
  Note,
  P,
} from '../partials/partials';

interface Props {
  inviteLink: string;
  invitedByName?: string;
  workspaceName?: string;
  roleLabel?: string;
  /** Suite apps this workspace offers, e.g. ConqrMeet when it is deployed. */
  meetEnabled?: boolean;
  recipient?: string;
}

export const InvitationEmail = ({
  inviteLink,
  invitedByName,
  workspaceName,
  roleLabel,
  meetEnabled,
  recipient,
}: Props) => {
  const space = workspaceName || 'votre équipe';
  const apps = [
    {
      title: 'ConqrHub',
      meta: "Base de connaissances, transcriptions et rapports d'entretien",
    },
    ...(meetEnabled
      ? [
          {
            title: 'ConqrMeet',
            meta: 'Enregistrement et compte rendu de vos réunions',
          },
        ]
      : []),
  ];
  return (
    <MailBody
      product="ai"
      icon="user-plus-brand"
      preview={
        meetEnabled
          ? 'Un seul compte pour ConqrHub et ConqrMeet.'
          : "Acceptez l'invitation pour créer votre compte."
      }
      heading={
        workspaceName
          ? `Rejoignez l'espace ${workspaceName}`
          : 'Rejoignez votre équipe'
      }
      reason={`Cet e-mail a été envoyé${recipient ? ` à ${recipient}` : ''} à la demande d'un administrateur de ${space}.`}
    >
      <P>Bonjour,</P>
      <P>
        {invitedByName ? <B>{invitedByName}</B> : 'Un administrateur'} vous
        invite à rejoindre l'espace de travail <B>{space}</B>.{' '}
        {apps.length > 1
          ? 'Un seul compte vous donne accès aux applications suivantes :'
          : 'Votre compte vous donne accès à :'}
      </P>
      <ItemList items={apps} />
      {roleLabel && (
        <P>
          Votre rôle : <B>{roleLabel}</B>.
        </P>
      )}
      <Actions href={inviteLink} label="Accepter l'invitation" />
      <FallbackLink href={inviteLink} />
      <Note>
        Vous ne connaissez pas {invitedByName || "l'expéditeur"} ou n'attendiez
        pas cette invitation ? Ignorez cet e-mail : aucun compte ne sera créé.
      </Note>
    </MailBody>
  );
};

export default InvitationEmail;
