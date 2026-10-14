import * as React from 'react';
import { Actions, B, MailBody, P, Quote } from '../partials/partials';

interface Props {
  actorName: string;
  pageTitle: string;
  pageUrl: string;
  excerpt?: string;
  /** True for a reply in a thread the recipient took part in. */
  isReply?: boolean;
}

export const CommentCreateEmail = ({
  actorName,
  pageTitle,
  pageUrl,
  excerpt,
  isReply,
}: Props) => {
  return (
    <MailBody
      product="hub"
      icon="message-square-brand"
      preview={
        excerpt ? `${actorName} : « ${excerpt} »` : `Sur « ${pageTitle} »`
      }
      heading={isReply ? 'Nouvelle réponse' : 'Nouveau commentaire'}
    >
      <P>
        <B>{actorName}</B>{' '}
        {isReply ? 'a répondu à une discussion sur' : 'a commenté'} la page{' '}
        <B>« {pageTitle} »</B>.
      </P>
      {excerpt && <Quote author={actorName}>{excerpt}</Quote>}
      <Actions href={pageUrl} label="Voir le commentaire" />
    </MailBody>
  );
};

export default CommentCreateEmail;
