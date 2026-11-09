import * as React from 'react';
import {
  Actions,
  ItemList,
  MailBody,
  MailLanguage,
  P,
  greeting,
} from '../partials/partials';

interface Props {
  lang: MailLanguage;
  userName?: string;
  workspaceName?: string;
  appUrl: string;
  /** ConqrMeet is offered only where it is deployed. */
  meetEnabled?: boolean;
  recipient?: string;
}

export const WelcomeEmail = ({
  lang,
  userName,
  workspaceName,
  appUrl,
  meetEnabled,
  recipient,
}: Props) => {
  if (lang === 'fr') {
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
        lang={lang}
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
        <P>{greeting(userName, lang)}</P>
        <P>
          Votre compte est prêt. Voici {steps.length === 3 ? 'trois' : 'deux'}{' '}
          étapes pour bien démarrer.
        </P>
        <ItemList items={steps} numbered />
        <Actions href={appUrl} label="Ouvrir ConqrAI" />
      </MailBody>
    );
  }
  const steps = [
    {
      title: 'Complete your profile',
      meta: 'Photo, job title and interface language',
    },
    {
      title: 'Explore ConqrHub',
      meta: "Find your team's pages and procedures",
    },
    ...(meetEnabled
      ? [
          {
            title: 'Record a meeting with ConqrMeet',
            meta: 'The minutes then arrive in ConqrHub',
          },
        ]
      : []),
  ];
  return (
    <MailBody
      lang={lang}
      product="ai"
      icon="rocket-brand"
      preview={`${steps.length} steps to get started.`}
      heading={
        workspaceName
          ? `Welcome to the ${workspaceName} workspace`
          : 'Welcome to ConqrAI'
      }
      reason="This welcome e-mail is sent only once, when your account is created."
      recipient={recipient}
    >
      <P>{greeting(userName, lang)}</P>
      <P>
        Your account is ready. Here are {steps.length === 3 ? 'three' : 'two'}{' '}
        steps to get started.
      </P>
      <ItemList items={steps} numbered />
      <Actions href={appUrl} label="Open ConqrAI" />
    </MailBody>
  );
};

export default WelcomeEmail;
