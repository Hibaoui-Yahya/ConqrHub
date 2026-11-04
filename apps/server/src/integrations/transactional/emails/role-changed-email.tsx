import * as React from 'react';
import {
  Actions,
  B,
  Details,
  MailBody,
  MailLanguage,
  Note,
  P,
  greeting,
} from '../partials/partials';

interface Props {
  lang: MailLanguage;
  userName?: string;
  actorName: string;
  workspaceName?: string;
  oldRoleLabel: string;
  newRoleLabel: string;
  appUrl: string;
  recipient?: string;
}

export const RoleChangedEmail = ({
  lang,
  userName,
  actorName,
  workspaceName,
  oldRoleLabel,
  newRoleLabel,
  appUrl,
  recipient,
}: Props) => {
  if (lang === 'fr') {
    return (
      <MailBody
        lang={lang}
        product="ai"
        icon="user-cog-brand"
        preview={`Vous êtes désormais ${newRoleLabel}${workspaceName ? ` de ${workspaceName}` : ''}.`}
        heading="Vos accès ont été mis à jour"
        recipient={recipient}
      >
        <P>{greeting(userName, lang)}</P>
        <P>
          <B>{actorName}</B> a modifié votre rôle
          {workspaceName ? (
            <>
              {' '}
              dans l'espace <B>{workspaceName}</B>
            </>
          ) : null}
          . Le changement est déjà actif.
        </P>
        <Details rows={[['Rôle', `${oldRoleLabel} → ${newRoleLabel}`]]} />
        <Actions href={appUrl} label="Ouvrir ConqrAI" />
        <Note>
          Une question sur ces droits ? Contactez {actorName} ou un autre
          administrateur de votre espace.
        </Note>
      </MailBody>
    );
  }
  return (
    <MailBody
      lang={lang}
      product="ai"
      icon="user-cog-brand"
      preview={`You are now ${newRoleLabel}${workspaceName ? ` of ${workspaceName}` : ''}.`}
      heading="Your access has been updated"
      recipient={recipient}
    >
      <P>{greeting(userName, lang)}</P>
      <P>
        <B>{actorName}</B> changed your role
        {workspaceName ? (
          <>
            {' '}
            in the <B>{workspaceName}</B> workspace
          </>
        ) : null}
        . The change is already in effect.
      </P>
      <Details rows={[['Role', `${oldRoleLabel} → ${newRoleLabel}`]]} />
      <Actions href={appUrl} label="Open ConqrAI" />
      <Note>
        A question about these rights? Contact {actorName} or another
        administrator of your workspace.
      </Note>
    </MailBody>
  );
};

export default RoleChangedEmail;
