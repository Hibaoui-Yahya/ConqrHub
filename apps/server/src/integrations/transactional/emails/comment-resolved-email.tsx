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
  /** The recipient's own comment that was resolved. */
  excerpt?: string;
}

export const CommentResolvedEmail = ({
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
        icon="check-check-success"
        preview={`${actorName} a clos la discussion sur « ${pageTitle} ».`}
        heading="Commentaire résolu"
      >
        <P>
          <B>{actorName}</B> a marqué votre commentaire comme résolu sur la
          page <B>« {pageTitle} »</B>.
        </P>
        {excerpt && (
          <Quote author="Votre commentaire" resolved>
            {excerpt}
          </Quote>
        )}
        <Actions href={pageUrl} label="Voir la discussion" />
      </MailBody>
    );
  }
  return (
    <MailBody
      lang={lang}
      product="hub"
      icon="check-check-success"
      preview={`${actorName} closed the discussion on “${pageTitle}”.`}
      heading="Comment resolved"
    >
      <P>
        <B>{actorName}</B> marked your comment as resolved on the page{' '}
        <B>“{pageTitle}”</B>.
      </P>
      {excerpt && (
        <Quote author="Your comment" resolved>
          {excerpt}
        </Quote>
      )}
      <Actions href={pageUrl} label="View the discussion" />
    </MailBody>
  );
};

export default CommentResolvedEmail;
