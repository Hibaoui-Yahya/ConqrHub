import * as React from 'react';
import {
  Actions,
  B,
  MailBody,
  MailLanguage,
  Meter,
  P,
} from '../partials/partials';

interface Props {
  lang: MailLanguage;
  scopeLabel: string;
  score: number;
  threshold: number;
  dashboardUrl: string;
}

export const DocHealthDroppedEmail = ({
  lang,
  scopeLabel,
  score,
  threshold,
  dashboardUrl,
}: Props) => {
  if (lang === 'fr') {
    return (
      <MailBody
        lang={lang}
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
          lang={lang}
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
  }
  return (
    <MailBody
      lang={lang}
      product="hub"
      icon="activity-warning"
      preview={`Score ${score}/100, below your threshold of ${threshold}.`}
      heading="Documentation health is dropping"
      reason="You are receiving this e-mail because you follow the documentation health of this space."
    >
      <P>
        The health score of <B>{scopeLabel}</B> dropped to <B>{score}</B>,
        below your alert threshold of <B>{threshold}</B>.
      </P>
      <Meter
        lang={lang}
        label={`Health score · ${scopeLabel}`}
        value={score}
        threshold={threshold}
      />
      <P>
        The dashboard shows the pages pulling the score down: outdated
        content, pages without an owner, expired verifications and pages that
        are too short, each with its one-click action.
      </P>
      <Actions href={dashboardUrl} label="Open the dashboard" />
    </MailBody>
  );
};

export default DocHealthDroppedEmail;
