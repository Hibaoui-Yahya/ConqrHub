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
  excerpt?: string;
  /** True for a reply in a thread the recipient took part in. */
  isReply?: boolean;
}

export const CommentCreateEmail = ({
  lang,
  actorName,
  pageTitle,
  pageUrl,
  excerpt,
  isReply,
}: Props) => {
  if (lang === 'fr') {
    return (
      <MailBody
        lang={lang}
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
  }
  return (
    <MailBody
      lang={lang}
      product="hub"
      icon="message-square-brand"
      preview={excerpt ? `${actorName}: “${excerpt}”` : `On “${pageTitle}”`}
      heading={isReply ? 'New reply' : 'New comment'}
    >
      <P>
        <B>{actorName}</B>{' '}
        {isReply ? 'replied to a discussion on' : 'commented on'} the page{' '}
        <B>“{pageTitle}”</B>.
      </P>
      {excerpt && <Quote author={actorName}>{excerpt}</Quote>}
      <Actions href={pageUrl} label="View the comment" />
    </MailBody>
  );
};

export default CommentCreateEmail;
