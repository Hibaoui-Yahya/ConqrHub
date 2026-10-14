import * as React from 'react';
import {
  Actions,
  B,
  Details,
  MailBody,
  Note,
  P,
  greeting,
} from '../partials/partials';

interface Props {
  userName?: string;
  actorName: string;
  workspaceName?: string;
  oldRoleLabel: string;
  newRoleLabel: string;
  appUrl: string;
  recipient?: string;
}

export const RoleChangedEmail = ({
  userName,
  actorName,
  workspaceName,
  oldRoleLabel,
  newRoleLabel,
  appUrl,
  recipient,
}: Props) => {
  return (
    <MailBody
      product="ai"
      icon="user-cog-brand"
      preview={`Vous êtes désormais ${newRoleLabel}${workspaceName ? ` de ${workspaceName}` : ''}.`}
      heading="Vos accès ont été mis à jour"
      recipient={recipient}
    >
      <P>{greeting(userName)}</P>
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
};

export default RoleChangedEmail;
