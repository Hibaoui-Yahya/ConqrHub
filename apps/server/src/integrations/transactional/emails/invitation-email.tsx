import * as React from 'react';
import {
  Actions,
  B,
  FallbackLink,
  ItemList,
  MailBody,
  MailLanguage,
  Note,
  P,
} from '../partials/partials';
import { INVITATION_VALIDITY_DAYS } from '../../../core/workspace/invitation-expiry';

interface Props {
  /** The invitee has no account yet: the inviter's language. */
  lang: MailLanguage;
  inviteLink: string;
  invitedByName?: string;
  workspaceName?: string;
  roleLabel?: string;
  /** Suite apps this workspace offers, e.g. ConqrMeet when it is deployed. */
  meetEnabled?: boolean;
  recipient?: string;
}

export const InvitationEmail = ({
  lang,
  inviteLink,
  invitedByName,
  workspaceName,
  roleLabel,
  meetEnabled,
  recipient,
}: Props) => {
  if (lang === 'fr') {
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
        lang={lang}
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
        <FallbackLink href={inviteLink} lang={lang} />
        <P>
          Ce lien est valable <B>{INVITATION_VALIDITY_DAYS} jours</B>. En
          acceptant l'invitation, vous choisissez vous-même votre mot de passe :
          personne d'autre ne le connaît.
        </P>
        <Note>
          Vous ne connaissez pas {invitedByName || "l'expéditeur"} ou
          n'attendiez pas cette invitation ? Ignorez cet e-mail : aucun compte
          ne sera créé.
        </Note>
      </MailBody>
    );
  }
  const space = workspaceName || 'your team';
  const apps = [
    {
      title: 'ConqrHub',
      meta: 'Knowledge base, transcripts and interview reports',
    },
    ...(meetEnabled
      ? [
          {
            title: 'ConqrMeet',
            meta: 'Recording and minutes of your meetings',
          },
        ]
      : []),
  ];
  return (
    <MailBody
      lang={lang}
      product="ai"
      icon="user-plus-brand"
      preview={
        meetEnabled
          ? 'One account for ConqrHub and ConqrMeet.'
          : 'Accept the invitation to create your account.'
      }
      heading={
        workspaceName ? `Join the ${workspaceName} workspace` : 'Join your team'
      }
      reason={`This e-mail was sent${recipient ? ` to ${recipient}` : ''} at the request of an administrator of ${space}.`}
    >
      <P>Hello,</P>
      <P>
        {invitedByName ? <B>{invitedByName}</B> : 'An administrator'} is
        inviting you to join the <B>{space}</B> workspace.{' '}
        {apps.length > 1
          ? 'One account gives you access to the following applications:'
          : 'Your account gives you access to:'}
      </P>
      <ItemList items={apps} />
      {roleLabel && (
        <P>
          Your role: <B>{roleLabel}</B>.
        </P>
      )}
      <Actions href={inviteLink} label="Accept the invitation" />
      <FallbackLink href={inviteLink} lang={lang} />
      <P>
        This link is valid for <B>{INVITATION_VALIDITY_DAYS} days</B>. When you
        accept the invitation, you choose your own password: nobody else knows
        it.
      </P>
      <Note>
        Don't know {invitedByName || 'the sender'} or weren't expecting this
        invitation? Ignore this e-mail: no account will be created.
      </Note>
    </MailBody>
  );
};

export default InvitationEmail;
