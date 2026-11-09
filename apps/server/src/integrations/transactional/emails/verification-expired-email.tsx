import * as React from 'react';
import { Actions, B, MailBody, MailLanguage, P } from '../partials/partials';

interface Props {
  lang: MailLanguage;
  pageTitle: string;
  spaceName: string;
  pageUrl: string;
}

export const VerificationExpiredEmail = ({
  lang,
  pageTitle,
  spaceName,
  pageUrl,
}: Props) => {
  if (lang === 'fr') {
    return (
      <MailBody
        lang={lang}
        product="hub"
        icon="triangle-alert-danger"
        preview="La page est exclue des réponses de l'IA jusqu'à sa revérification."
        heading="La vérification a expiré"
        reason="Vous recevez cet e-mail parce que vous vérifiez cette page."
      >
        <P>
          La page <B>« {pageTitle} »</B>
          {spaceName ? ` (espace ${spaceName})` : ''} n'est plus vérifiée. Elle
          reste consultable, mais « Demander à l'IA » ne s'en sert plus jusqu'à
          sa revérification.
        </P>
        <Actions href={pageUrl} label="Revérifier la page" />
      </MailBody>
    );
  }
  return (
    <MailBody
      lang={lang}
      product="hub"
      icon="triangle-alert-danger"
      preview="The page is left out of AI answers until it is verified again."
      heading="The verification has expired"
      reason="You are receiving this e-mail because you verify this page."
    >
      <P>
        The page <B>“{pageTitle}”</B>
        {spaceName ? ` (${spaceName} space)` : ''} is no longer verified. It
        can still be read, but “Ask AI” no longer uses it until it is verified
        again.
      </P>
      <Actions href={pageUrl} label="Verify the page again" />
    </MailBody>
  );
};

export default VerificationExpiredEmail;
