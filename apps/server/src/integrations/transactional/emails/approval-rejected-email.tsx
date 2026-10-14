import * as React from 'react';
import { Actions, B, MailBody, P, Quote } from '../partials/partials';

interface Props {
  actorName: string;
  pageTitle: string;
  spaceName: string;
  pageUrl: string;
  comment?: string;
}

export const ApprovalRejectedEmail = ({
  actorName,
  pageTitle,
  spaceName,
  pageUrl,
  comment,
}: Props) => {
  return (
    <MailBody
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
};

export default ApprovalRejectedEmail;
