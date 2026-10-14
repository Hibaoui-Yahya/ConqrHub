import * as React from 'react';
import { Actions, B, Details, MailBody, P } from '../partials/partials';

interface Props {
  pageTitle: string;
  spaceName: string;
  pageUrl: string;
  /** Already formatted, e.g. "21 octobre 2026". */
  expiresAt: string;
}

export const VerificationExpiringEmail = ({
  pageTitle,
  spaceName,
  pageUrl,
  expiresAt,
}: Props) => {
  return (
    <MailBody
      product="hub"
      icon="timer-warning"
      preview="Revérifiez-la pour qu'elle reste dans les réponses de l'IA."
      heading="Une vérification arrive à échéance"
      reason="Vous recevez cet e-mail parce que vous vérifiez cette page."
    >
      <P>
        La vérification de la page <B>« {pageTitle} »</B> expire le{' '}
        <B>{expiresAt}</B>. Sans revérification, « Demander à l'IA » ne
        s'appuiera plus sur cette page.
      </P>
      <Details
        rows={[
          ['Page', pageTitle],
          ['Espace', spaceName],
          ['Expire le', expiresAt],
        ]}
      />
      <Actions href={pageUrl} label="Revérifier la page" />
    </MailBody>
  );
};

export default VerificationExpiringEmail;
