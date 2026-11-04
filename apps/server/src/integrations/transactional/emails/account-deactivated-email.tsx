import * as React from 'react';
import {
  B,
  MailBody,
  MailLanguage,
  Note,
  P,
  formatMailDay,
  greeting,
} from '../partials/partials';

interface Props {
  lang: MailLanguage;
  userName?: string;
  workspaceName?: string;
  deactivatedAt: Date | string;
  /** True when the account was deleted rather than deactivated. */
  deleted?: boolean;
  meetEnabled?: boolean;
  recipient?: string;
}

export const AccountDeactivatedEmail = ({
  lang,
  userName,
  workspaceName,
  deactivatedAt,
  deleted,
  meetEnabled,
  recipient,
}: Props) => {
  const date = formatMailDay(deactivatedAt, lang);
  if (lang === 'fr') {
    const space = workspaceName ? `l'espace ${workspaceName}` : 'votre espace';
    return (
      <MailBody
        lang={lang}
        product="ai"
        icon="user-x-danger"
        preview="Vous ne pouvez plus vous connecter à cet espace."
        heading={
          deleted ? 'Votre compte a été supprimé' : 'Votre accès a été désactivé'
        }
        recipient={recipient}
      >
        <P>{greeting(userName, lang)}</P>
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
  }
  const space = workspaceName
    ? `the ${workspaceName} workspace`
    : 'your workspace';
  return (
    <MailBody
      lang={lang}
      product="ai"
      icon="user-x-danger"
      preview="You can no longer sign in to this workspace."
      heading={
        deleted
          ? 'Your account has been deleted'
          : 'Your access has been deactivated'
      }
      recipient={recipient}
    >
      <P>{greeting(userName, lang)}</P>
      <P>
        An administrator {deleted ? 'deleted' : 'deactivated'} your account in{' '}
        {space} on <B>{date}</B>. You can no longer sign in to ConqrHub
        {meetEnabled ? ' or ConqrMeet' : ''} for this workspace.
      </P>
      <P>The content you created remains available to the team.</P>
      <Note>Think this is a mistake? Contact your workspace administrator.</Note>
    </MailBody>
  );
};

export default AccountDeactivatedEmail;
