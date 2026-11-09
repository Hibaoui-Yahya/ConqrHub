import * as React from 'react';
import {
  Actions,
  B,
  MailBody,
  MailLanguage,
  P,
  greeting,
} from '../partials/partials';

interface Props {
  lang: MailLanguage;
  userName?: string;
  actorName: string;
  pageTitle: string;
  spaceName: string;
  pageUrl: string;
}

export const ApprovalApprovedEmail = ({
  lang,
  userName,
  actorName,
  pageTitle,
  spaceName,
  pageUrl,
}: Props) => {
  if (lang === 'fr') {
    return (
      <MailBody
        lang={lang}
        product="hub"
        icon="badge-check-success"
        preview={`${actorName} a validé votre page. Elle est publiée.`}
        heading="Votre page est approuvée"
        reason="Vous recevez cet e-mail parce que vous avez soumis cette page à approbation."
      >
        <P>{greeting(userName, lang)}</P>
        <P>
          Bonne nouvelle : <B>{actorName}</B> a approuvé la page{' '}
          <B>« {pageTitle} »</B>. Elle est maintenant publiée
          {spaceName ? ` et visible dans l'espace ${spaceName}` : ''}.
        </P>
        <Actions href={pageUrl} label="Voir la page" />
      </MailBody>
    );
  }
  return (
    <MailBody
      lang={lang}
      product="hub"
      icon="badge-check-success"
      preview={`${actorName} approved your page. It is published.`}
      heading="Your page is approved"
      reason="You are receiving this e-mail because you submitted this page for approval."
    >
      <P>{greeting(userName, lang)}</P>
      <P>
        Good news: <B>{actorName}</B> approved the page <B>“{pageTitle}”</B>.
        It is now published
        {spaceName ? ` and visible in the ${spaceName} space` : ''}.
      </P>
      <Actions href={pageUrl} label="View the page" />
    </MailBody>
  );
};

export default ApprovalApprovedEmail;
