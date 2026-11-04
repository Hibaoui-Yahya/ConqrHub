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
  userName: string;
  actorName: string;
  pageTitle: string;
  pageUrl: string;
  spaceName: string;
}

export const PageUpdateEmail = ({
  lang,
  userName,
  actorName,
  pageTitle,
  pageUrl,
  spaceName,
}: Props) => {
  if (lang === 'fr') {
    return (
      <MailBody
        lang={lang}
        product="hub"
        icon="pencil-brand"
        preview={`Par ${actorName}${spaceName ? ` dans ${spaceName}` : ''}`}
        heading="Une page que vous suivez a changé"
        reason="Vous suivez cette page. Vous pouvez ne plus la suivre depuis ConqrHub."
      >
        <P>{greeting(userName, lang)}</P>
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
  }
  return (
    <MailBody
      lang={lang}
      product="hub"
      icon="pencil-brand"
      preview={`By ${actorName}${spaceName ? ` in ${spaceName}` : ''}`}
      heading="A page you follow has changed"
      reason="You follow this page. You can stop following it from ConqrHub."
    >
      <P>{greeting(userName, lang)}</P>
      <P>
        <B>{actorName}</B> edited the page <B>“{pageTitle}”</B>
        {spaceName ? ` in the ${spaceName} space` : ''}.
      </P>
      <Details
        rows={[
          ['Page', pageTitle],
          ['Space', spaceName],
          ['Edited by', actorName],
        ]}
      />
      <Actions href={pageUrl} label="View the changes" />
    </MailBody>
  );
};

export default PageUpdateEmail;
