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
  userName: string;
  actorName: string;
  pageTitle: string;
  pageUrl: string;
  spaceName: string;
}

export const PageUpdateEmail = ({
  userName,
  actorName,
  pageTitle,
  pageUrl,
  spaceName,
}: Props) => {
  return (
    <MailBody
      product="hub"
      icon="pencil-brand"
      preview={`Par ${actorName}${spaceName ? ` dans ${spaceName}` : ''}`}
      heading="Une page que vous suivez a changé"
      reason="Vous suivez cette page. Vous pouvez ne plus la suivre depuis ConqrHub."
    >
      <P>{greeting(userName)}</P>
      <P>
        <B>{actorName}</B> a modifié la page <B>« {pageTitle} »</B>
        {spaceName ? ` dans l'espace ${spaceName}` : ''}.
      </P>
      <Details
        rows={[
          ['Page', pageTitle],
          ['Espace', spaceName],
          ['Modifiée par', actorName],
        ]}
      />
      <Actions href={pageUrl} label="Voir les modifications" />
    </MailBody>
  );
};

export default PageUpdateEmail;
