import * as React from 'react';
import { Actions, B, MailBody, P, Quote } from '../partials/partials';

interface Props {
  actorName: string;
  pageTitle: string;
  pageUrl: string;
  spaceName?: string;
  /** Text around the mention, when known. */
  excerpt?: string;
}

export const PageMentionEmail = ({
  actorName,
  pageTitle,
  pageUrl,
  spaceName,
  excerpt,
}: Props) => {
  return (
    <MailBody
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
};

export default PageMentionEmail;
