import * as React from 'react';
import {
  Actions,
  B,
  Details,
  MailBody,
  MailLanguage,
  P,
} from '../partials/partials';
import { accessLabel as accessLabelOf } from '../utils/utils';

interface Props {
  lang: MailLanguage;
  actorName: string;
  pageTitle: string;
  pageUrl: string;
  accessLabel: string;
  spaceName?: string;
}

export const PermissionGrantedEmail = ({
  lang,
  actorName,
  pageTitle,
  pageUrl,
  accessLabel,
  spaceName,
}: Props) => {
  const access = accessLabelOf(accessLabel, lang);
  if (lang === 'fr') {
    return (
      <MailBody
        lang={lang}
        product="hub"
        icon="lock-open-success"
        preview={`Droit : ${access}${spaceName ? ` · Espace ${spaceName}` : ''}`}
        heading="Vous avez accès à une nouvelle page"
      >
        <P>
          <B>{actorName}</B> vous donne accès à la page <B>« {pageTitle} »</B>.
        </P>
        <Details
          rows={[
            ['Page', pageTitle],
            ['Espace', spaceName],
            ['Votre accès', access],
          ]}
        />
        <Actions href={pageUrl} label="Ouvrir la page" />
      </MailBody>
    );
  }
  return (
    <MailBody
      lang={lang}
      product="hub"
      icon="lock-open-success"
      preview={`Access: ${access}${spaceName ? ` · ${spaceName} space` : ''}`}
      heading="You have access to a new page"
    >
      <P>
        <B>{actorName}</B> gave you access to the page <B>“{pageTitle}”</B>.
      </P>
      <Details
        rows={[
          ['Page', pageTitle],
          ['Space', spaceName],
          ['Your access', access],
        ]}
      />
      <Actions href={pageUrl} label="Open the page" />
    </MailBody>
  );
};

export default PermissionGrantedEmail;
