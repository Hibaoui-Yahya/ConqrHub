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
  pageTitle: string;
  spaceName: string;
  pageUrl: string;
  /** Already formatted in `lang`, e.g. "21 octobre 2026". */
  expiresAt: string;
}

export const VerificationExpiringEmail = ({
  lang,
  pageTitle,
  spaceName,
  pageUrl,
  expiresAt,
}: Props) => {
  if (lang === 'fr') {
    return (
      <MailBody
        lang={lang}
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
  }
  return (
    <MailBody
      lang={lang}
      product="hub"
      icon="timer-warning"
      preview="Verify it again so it stays in AI answers."
      heading="A verification is about to expire"
      reason="You are receiving this e-mail because you verify this page."
    >
      <P>
        The verification of the page <B>“{pageTitle}”</B> expires on{' '}
        <B>{expiresAt}</B>. Without a new verification, “Ask AI” will no longer
        rely on this page.
      </P>
      <Details
        rows={[
          ['Page', pageTitle],
          ['Space', spaceName],
          ['Expires on', expiresAt],
        ]}
      />
      <Actions href={pageUrl} label="Verify the page again" />
    </MailBody>
  );
};

export default VerificationExpiringEmail;
