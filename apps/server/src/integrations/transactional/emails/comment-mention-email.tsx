import * as React from 'react';
import { Actions, B, MailBody, P, Quote } from '../partials/partials';

interface Props {
  actorName: string;
  pageTitle: string;
  pageUrl: string;
  /** Plain-text body of the comment. */
  excerpt?: string;
}

export const CommentMentionEmail = ({
  actorName,
  pageTitle,
  pageUrl,
  excerpt,
}: Props) => {
  return (
    <MailBody
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
};

export default CommentMentionEmail;
