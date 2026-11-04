import * as React from 'react';
import {
  Actions,
  B,
  MailBody,
  MailLanguage,
  P,
  Quote,
} from '../partials/partials';

interface Props {
  lang: MailLanguage;
  actorName: string;
  pageTitle: string;
  pageUrl: string;
  spaceName?: string;
  /** Text around the mention, when known. */
  excerpt?: string;
}

export const PageMentionEmail = ({
  lang,
  actorName,
  pageTitle,
  pageUrl,
  spaceName,
  excerpt,
}: Props) => {
  if (lang === 'fr') {
    return (
      <MailBody
        lang={lang}
        product="hub"
        icon="at-sign-brand"
        preview={spaceName ? `Espace ${spaceName}` : `Dans « ${pageTitle} »`}
        heading="Nouvelle mention dans une page"
      >
        <P>
          <B>{actorName}</B> vous mentionne dans la page <B>« {pageTitle} »</B>
          {spaceName ? `, espace ${spaceName}` : ''}.
        </P>
        {excerpt && <Quote author={pageTitle}>{excerpt}</Quote>}
        <Actions href={pageUrl} label="Ouvrir la page" />
      </MailBody>
    );
  }
  return (
    <MailBody
      lang={lang}
      product="hub"
      icon="at-sign-brand"
      preview={spaceName ? `${spaceName} space` : `In “${pageTitle}”`}
      heading="New mention in a page"
    >
      <P>
        <B>{actorName}</B> mentioned you in the page <B>“{pageTitle}”</B>
        {spaceName ? `, ${spaceName} space` : ''}.
      </P>
      {excerpt && <Quote author={pageTitle}>{excerpt}</Quote>}
      <Actions href={pageUrl} label="Open the page" />
    </MailBody>
  );
};

export default PageMentionEmail;
