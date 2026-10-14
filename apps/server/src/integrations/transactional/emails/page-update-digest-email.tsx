import * as React from 'react';
import {
  Actions,
  ItemList,
  MailBody,
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
  userName: string;
  pageUpdates: PageUpdate[];
  totalUpdates: number;
}

export const PageUpdateDigestEmail = ({
  userName,
  pageUpdates,
  totalUpdates,
}: Props) => {
  const first = pageUpdates.slice(0, 2).map((p) => p.title);
  const rest = Math.max(0, pageUpdates.length - first.length);
  const origin = appOrigin();
  return (
    <MailBody
      product="hub"
      icon="newspaper-brand"
      preview={`${first.join(', ')}${rest ? ` et ${rest} autre${rest > 1 ? 's' : ''}` : ''}`}
      heading="Votre résumé des mises à jour"
    >
      <P>{greeting(userName)}</P>
      <P>
        {totalUpdates === 1
          ? 'Une page que vous suivez a changé depuis votre dernier résumé.'
          : `${totalUpdates} modifications ont eu lieu sur les pages que vous suivez depuis votre dernier résumé.`}
      </P>
      <ItemList
        items={pageUpdates.map((p) => ({
          title: p.title,
          href: p.url,
          meta: [
            p.spaceName,
            p.updatedBy.length ? `par ${p.updatedBy.join(', ')}` : '',
          ]
            .filter(Boolean)
            .join(' · '),
        }))}
      />
      {origin && <Actions href={origin} label="Tout voir dans ConqrHub" />}
    </MailBody>
  );
};

export default PageUpdateDigestEmail;
