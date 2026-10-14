import * as React from 'react';
import { Actions, B, MailBody, P } from '../partials/partials';

interface Props {
  pageTitle: string;
  spaceName: string;
  pageUrl: string;
}

export const VerificationExpiredEmail = ({
  pageTitle,
  spaceName,
  pageUrl,
}: Props) => {
  return (
    <MailBody
      product="hub"
      icon="triangle-alert-danger"
      preview="La page est exclue des réponses de l'IA jusqu'à sa revérification."
      heading="La vérification a expiré"
      reason="Vous recevez cet e-mail parce que vous vérifiez cette page."
    >
      <P>
        La page <B>« {pageTitle} »</B>
        {spaceName ? ` (espace ${spaceName})` : ''} n'est plus vérifiée. Elle
        reste consultable, mais « Demander à l'IA » ne s'en sert plus jusqu'à sa
        revérification.
      </P>
      <Actions href={pageUrl} label="Revérifier la page" />
    </MailBody>
  );
};

export default VerificationExpiredEmail;
