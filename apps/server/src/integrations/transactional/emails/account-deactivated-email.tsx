import * as React from 'react';
import {
  B,
  MailBody,
  Note,
  P,
  formatDateFr,
  greeting,
} from '../partials/partials';

interface Props {
  userName?: string;
  workspaceName?: string;
  deactivatedAt: Date | string;
  /** True when the account was deleted rather than deactivated. */
  deleted?: boolean;
  meetEnabled?: boolean;
  recipient?: string;
}

export const AccountDeactivatedEmail = ({
  userName,
  workspaceName,
  deactivatedAt,
  deleted,
  meetEnabled,
  recipient,
}: Props) => {
  const space = workspaceName ? `l'espace ${workspaceName}` : 'votre espace';
  const date = formatDateFr(deactivatedAt).split(' à ')[0];
  return (
    <MailBody
      product="ai"
      icon="user-x-danger"
      preview="Vous ne pouvez plus vous connecter à cet espace."
      heading={
        deleted ? 'Votre compte a été supprimé' : 'Votre accès a été désactivé'
      }
      recipient={recipient}
    >
      <P>{greeting(userName)}</P>
      <P>
        Un administrateur a {deleted ? 'supprimé' : 'désactivé'} votre compte
        dans {space} le <B>{date}</B>. Vous ne pouvez plus vous connecter à
        ConqrHub{meetEnabled ? ' ni à ConqrMeet' : ''} pour cet espace.
      </P>
      <P>
        Les contenus que vous avez créés restent à la disposition de l'équipe.
      </P>
      <Note>
        Vous pensez qu'il s'agit d'une erreur ? Contactez l'administrateur de
        votre espace.
      </Note>
    </MailBody>
  );
};

export default AccountDeactivatedEmail;
