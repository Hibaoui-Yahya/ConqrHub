import * as React from 'react';
import { Actions, B, Details, MailBody, P } from '../partials/partials';
import { accessLabelFr } from '../utils/utils';

interface Props {
  actorName: string;
  pageTitle: string;
  pageUrl: string;
  accessLabel: string;
  spaceName?: string;
}

export const PermissionGrantedEmail = ({
  actorName,
  pageTitle,
  pageUrl,
  accessLabel,
  spaceName,
}: Props) => {
  const access = accessLabelFr(accessLabel);
  return (
    <MailBody
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
};

export default PermissionGrantedEmail;
