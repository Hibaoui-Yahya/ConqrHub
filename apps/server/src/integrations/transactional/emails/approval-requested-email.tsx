import * as React from 'react';
import { Actions, B, Details, MailBody, P } from '../partials/partials';

interface Props {
  actorName: string;
  pageTitle: string;
  spaceName: string;
  pageUrl: string;
  submittedAt?: string;
}

export const ApprovalRequestedEmail = ({
  actorName,
  pageTitle,
  spaceName,
  pageUrl,
  submittedAt,
}: Props) => {
  return (
    <MailBody
      product="hub"
      icon="clipboard-check-brand"
      preview={`${actorName} attend votre décision${spaceName ? ` · Espace ${spaceName}` : ''}`}
      heading="Une page attend votre approbation"
      reason="Vous recevez cet e-mail parce que vous approuvez les pages de cet espace."
    >
      <P>
        <B>{actorName}</B> soumet la page <B>« {pageTitle} »</B> à votre
        approbation.
      </P>
      <Details
        rows={[
          ['Page', pageTitle],
          ['Espace', spaceName],
          ['Soumise le', submittedAt],
        ]}
      />
      <Actions href={pageUrl} label="Examiner la page" />
    </MailBody>
  );
};

export default ApprovalRequestedEmail;
