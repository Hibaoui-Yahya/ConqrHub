import * as React from 'react';
import { Actions, B, MailBody, P, Quote } from '../partials/partials';

interface Props {
  actorName: string;
  pageTitle: string;
  pageUrl: string;
  /** The recipient's own comment that was resolved. */
  excerpt?: string;
}

export const CommentResolvedEmail = ({
  actorName,
  pageTitle,
  pageUrl,
  excerpt,
}: Props) => {
  return (
    <MailBody
      product="hub"
      icon="check-check-success"
      preview={`${actorName} a clos la discussion sur « ${pageTitle} ».`}
      heading="Commentaire résolu"
    >
      <P>
        <B>{actorName}</B> a marqué votre commentaire comme résolu sur la page{' '}
        <B>« {pageTitle} »</B>.
      </P>
      {excerpt && (
        <Quote author="Votre commentaire" resolved>
          {excerpt}
        </Quote>
      )}
      <Actions href={pageUrl} label="Voir la discussion" />
    </MailBody>
  );
};

export default CommentResolvedEmail;
