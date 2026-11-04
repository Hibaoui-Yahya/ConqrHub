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
  spaceName: string;
  pageUrl: string;
  comment?: string;
}

export const ApprovalRejectedEmail = ({
  lang,
  actorName,
  pageTitle,
  spaceName,
  pageUrl,
  comment,
}: Props) => {
  if (lang === 'fr') {
    return (
      <MailBody
        lang={lang}
        product="hub"
        icon="circle-x-danger"
        preview={
          comment
            ? `${actorName} : « ${comment} »`
            : `${actorName} demande des modifications.`
        }
        heading="Des modifications sont demandées"
        reason="Vous recevez cet e-mail parce que vous avez soumis cette page à approbation."
      >
        <P>
          <B>{actorName}</B> n'a pas approuvé la page <B>« {pageTitle} »</B>
          {spaceName ? ` (espace ${spaceName})` : ''}
          {comment ? ' et a laissé ce commentaire :' : '.'}
        </P>
        {comment && <Quote author={actorName}>{comment}</Quote>}
        <P>Modifiez la page, puis soumettez-la de nouveau.</P>
        <Actions href={pageUrl} label="Modifier la page" />
      </MailBody>
    );
  }
  return (
    <MailBody
      lang={lang}
      product="hub"
      icon="circle-x-danger"
      preview={
        comment
          ? `${actorName}: “${comment}”`
          : `${actorName} is asking for changes.`
      }
      heading="Changes are requested"
      reason="You are receiving this e-mail because you submitted this page for approval."
    >
      <P>
        <B>{actorName}</B> did not approve the page <B>“{pageTitle}”</B>
        {spaceName ? ` (${spaceName} space)` : ''}
        {comment ? ' and left this comment:' : '.'}
      </P>
      {comment && <Quote author={actorName}>{comment}</Quote>}
      <P>Edit the page, then submit it again.</P>
      <Actions href={pageUrl} label="Edit the page" />
    </MailBody>
  );
};

export default ApprovalRejectedEmail;
