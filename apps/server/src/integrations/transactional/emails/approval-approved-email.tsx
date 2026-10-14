import * as React from 'react';
import { Actions, B, MailBody, P, greeting } from '../partials/partials';

interface Props {
  userName?: string;
  actorName: string;
  pageTitle: string;
  spaceName: string;
  pageUrl: string;
}

export const ApprovalApprovedEmail = ({
  userName,
  actorName,
  pageTitle,
  spaceName,
  pageUrl,
}: Props) => {
  return (
    <MailBody
      product="hub"
      icon="badge-check-success"
      preview={`${actorName} a validé votre page. Elle est publiée.`}
      heading="Votre page est approuvée"
      reason="Vous recevez cet e-mail parce que vous avez soumis cette page à approbation."
    >
      <P>{greeting(userName)}</P>
      <P>
        Bonne nouvelle : <B>{actorName}</B> a approuvé la page{' '}
        <B>« {pageTitle} »</B>. Elle est maintenant publiée
        {spaceName ? ` et visible dans l'espace ${spaceName}` : ''}.
      </P>
      <Actions href={pageUrl} label="Voir la page" />
    </MailBody>
  );
};

export default ApprovalApprovedEmail;
