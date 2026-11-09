import * as React from 'react';
import {
  Actions,
  B,
  Details,
  MailBody,
  MailLanguage,
  P,
} from '../partials/partials';

interface Props {
  lang: MailLanguage;
  actorName: string;
  pageTitle: string;
  spaceName: string;
  pageUrl: string;
  submittedAt?: string;
}

export const ApprovalRequestedEmail = ({
  lang,
  actorName,
  pageTitle,
  spaceName,
  pageUrl,
  submittedAt,
}: Props) => {
  if (lang === 'fr') {
    return (
      <MailBody
        lang={lang}
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
  }
  return (
    <MailBody
      lang={lang}
      product="hub"
      icon="clipboard-check-brand"
      preview={`${actorName} is waiting for your decision${spaceName ? ` · ${spaceName} space` : ''}`}
      heading="A page is waiting for your approval"
      reason="You are receiving this e-mail because you approve the pages of this space."
    >
      <P>
        <B>{actorName}</B> is submitting the page <B>“{pageTitle}”</B> for your
        approval.
      </P>
      <Details
        rows={[
          ['Page', pageTitle],
          ['Space', spaceName],
          ['Submitted on', submittedAt],
        ]}
      />
      <Actions href={pageUrl} label="Review the page" />
    </MailBody>
  );
};

export default ApprovalRequestedEmail;
