import * as React from 'react';
import { Actions, ItemList, MailBody, P, greeting } from '../partials/partials';

interface Props {
  userName?: string;
  workspaceName?: string;
  appUrl: string;
  /** ConqrMeet is offered only where it is deployed. */
  meetEnabled?: boolean;
  recipient?: string;
}

export const WelcomeEmail = ({
  userName,
  workspaceName,
  appUrl,
  meetEnabled,
  recipient,
}: Props) => {
  const steps = [
    {
      title: 'Complétez votre profil',
      meta: "Photo, fonction et langue de l'interface",
    },
    {
      title: 'Explorez ConqrHub',
      meta: 'Retrouvez les pages et les procédures de votre équipe',
    },
    ...(meetEnabled
      ? [
          {
            title: 'Enregistrez une réunion avec ConqrMeet',
            meta: 'Le compte rendu arrive ensuite dans ConqrHub',
          },
        ]
      : []),
  ];
  return (
    <MailBody
      product="ai"
      icon="rocket-brand"
      preview={`${steps.length} étapes pour bien démarrer.`}
      heading={
        workspaceName
          ? `Bienvenue dans l'espace ${workspaceName}`
          : 'Bienvenue sur ConqrAI'
      }
      reason="Cet e-mail de bienvenue est envoyé une seule fois, à la création de votre compte."
      recipient={recipient}
    >
      <P>{greeting(userName)}</P>
      <P>
        Votre compte est prêt. Voici {steps.length === 3 ? 'trois' : 'deux'}{' '}
        étapes pour bien démarrer.
      </P>
      <ItemList items={steps} numbered />
      <Actions href={appUrl} label="Ouvrir ConqrAI" />
    </MailBody>
  );
};

export default WelcomeEmail;
