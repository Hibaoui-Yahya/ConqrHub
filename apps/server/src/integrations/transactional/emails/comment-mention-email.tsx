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
  /** Plain-text body of the comment. */
  excerpt?: string;
}

export const CommentMentionEmail = ({
  lang,
  actorName,
  pageTitle,
  pageUrl,
  excerpt,
}: Props) => {
  if (lang === 'fr') {
    return (
      <MailBody
        lang={lang}
        product="hub"
        icon="message-square-text-brand"
        preview={
          excerpt ? `${actorName} : « ${excerpt} »` : `Sur « ${pageTitle} »`
        }
        heading="Nouvelle mention dans un commentaire"
      >
        <P>
          <B>{actorName}</B> vous mentionne dans un commentaire sur la page{' '}
          <B>« {pageTitle} »</B>.
        </P>
        {excerpt && <Quote author={actorName}>{excerpt}</Quote>}
        <Actions href={pageUrl} label="Répondre" />
      </MailBody>
    );
  }
  return (
    <MailBody
      lang={lang}
      product="hub"
      icon="message-square-text-brand"
      preview={excerpt ? `${actorName}: “${excerpt}”` : `On “${pageTitle}”`}
      heading="New mention in a comment"
    >
      <P>
        <B>{actorName}</B> mentioned you in a comment on the page{' '}
        <B>“{pageTitle}”</B>.
      </P>
      {excerpt && <Quote author={actorName}>{excerpt}</Quote>}
      <Actions href={pageUrl} label="Reply" />
    </MailBody>
  );
};

export default CommentMentionEmail;
