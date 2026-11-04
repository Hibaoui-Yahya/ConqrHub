import * as React from 'react';
import {
  Actions,
  ItemList,
  MailBody,
  MailLanguage,
  P,
  appOrigin,
  greeting,
} from '../partials/partials';

interface PageUpdate {
  title: string;
  url: string;
  updatedBy: string[];
  spaceName?: string;
}

interface Props {
  lang: MailLanguage;
  userName: string;
  pageUpdates: PageUpdate[];
  totalUpdates: number;
}

export const PageUpdateDigestEmail = ({
  lang,
  userName,
  pageUpdates,
  totalUpdates,
}: Props) => {
  const fr = lang === 'fr';
  const first = pageUpdates.slice(0, 2).map((p) => p.title);
  const rest = Math.max(0, pageUpdates.length - first.length);
  const origin = appOrigin();
  const others = rest
    ? fr
      ? ` et ${rest} autre${rest > 1 ? 's' : ''}`
      : ` and ${rest} more`
    : '';
  return (
    <MailBody
      lang={lang}
      product="hub"
      icon="newspaper-brand"
      preview={`${first.join(', ')}${others}`}
      heading={fr ? 'Votre résumé des mises à jour' : 'Your update digest'}
    >
      <P>{greeting(userName, lang)}</P>
      <P>
        {fr
          ? totalUpdates === 1
            ? 'Une page que vous suivez a changé depuis votre dernier résumé.'
            : `${totalUpdates} modifications ont eu lieu sur les pages que vous suivez depuis votre dernier résumé.`
          : totalUpdates === 1
            ? 'A page you follow has changed since your last digest.'
            : `${totalUpdates} changes were made to the pages you follow since your last digest.`}
      </P>
      <ItemList
        items={pageUpdates.map((p) => ({
          title: p.title,
          href: p.url,
          meta: [
            p.spaceName,
            p.updatedBy.length
              ? `${fr ? 'par' : 'by'} ${p.updatedBy.join(', ')}`
              : '',
          ]
            .filter(Boolean)
            .join(' · '),
        }))}
      />
      {origin && (
        <Actions
          href={origin}
          label={fr ? 'Tout voir dans ConqrHub' : 'See everything in ConqrHub'}
        />
      )}
    </MailBody>
  );
};

export default PageUpdateDigestEmail;
