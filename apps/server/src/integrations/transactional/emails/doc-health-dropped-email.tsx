import * as React from 'react';
import { Actions, B, MailBody, Meter, P } from '../partials/partials';

interface Props {
  scopeLabel: string;
  score: number;
  threshold: number;
  dashboardUrl: string;
}

export const DocHealthDroppedEmail = ({
  scopeLabel,
  score,
  threshold,
  dashboardUrl,
}: Props) => {
  return (
    <MailBody
      product="hub"
      icon="activity-warning"
      preview={`Score ${score}/100, sous votre seuil de ${threshold}.`}
      heading="La santé documentaire baisse"
      reason="Vous recevez cet e-mail parce que vous suivez la santé documentaire de cet espace."
    >
      <P>
        Le score de santé de <B>{scopeLabel}</B> est passé à <B>{score}</B>,
        sous votre seuil d'alerte de <B>{threshold}</B>.
      </P>
      <Meter
        label={`Score de santé · ${scopeLabel}`}
        value={score}
        threshold={threshold}
      />
      <P>
        Le tableau de bord indique les pages qui font baisser le score :
        contenus anciens, pages sans responsable, vérifications expirées et
        pages trop courtes, chacune avec son action en un clic.
      </P>
      <Actions href={dashboardUrl} label="Ouvrir le tableau de bord" />
    </MailBody>
  );
};

export default DocHealthDroppedEmail;
