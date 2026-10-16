import type { TourStep } from "./product-tour.tsx";

/** ConqrHub first-run tour (design board "Visite guidée · ConqrHub · v1"). */
export const HUB_TOUR_STEPS: TourStep[] = [
  {
    chapter: "Bienvenue",
    title: "Bienvenue dans ConqrHub",
    body: "ConqrHub est la base de connaissances de l'équipe : vos procédures, vos mandats, les rapports d'entrevue publiés depuis ConqrMeet, et des réponses de l'IA appuyées sur des pages vérifiées.",
    points: [
      "Un seul compte pour ConqrHub et ConqrMeet ; le sélecteur d'applications en haut à gauche passe de l'un à l'autre",
      "Tout ce que vous écrivez est partagé avec votre espace, en temps réel",
      "Cinq minutes pour faire le tour, à revoir quand vous voulez",
    ],
  },
  {
    chapter: "Accueil",
    title: "Votre accueil, ce qui vous concerne",
    body: "L'accueil réunit ce qui attend votre action et ce qui a bougé dans vos espaces.",
    points: [
      "« À traiter » : mentions, approbations, pages à revérifier, réunions ConqrMeet à vérifier ou publier",
      "« Reprendre » : vos pages et vos favoris ; « Nouveau dans mes espaces » : les changements de vos collègues",
      "Responsables d'espace : « État de mes espaces » (pages vérifiées, à revérifier)",
    ],
  },
  {
    chapter: "Espaces et pages",
    title: "Espaces et pages",
    body: "Chaque équipe a son espace ; chaque espace range ses pages en arbre. Les pages se créent, se glissent et s'imbriquent librement.",
    points: [
      "« Nouvelle page » ou « + » sur une page pour créer une sous-page",
      "Glissez une page dans l'arbre pour la déplacer ; menu ⋯ : Dupliquer, Déplacer, Exporter",
      "« Modèles » : partez d'une page type avec « Utiliser le modèle »",
    ],
  },
  {
    chapter: "Écrire",
    title: "Écrivez avec « / » et « @ »",
    body: "Tapez « / » pour insérer un bloc, « @ » pour citer une personne ou une page. Vos collègues voient vos modifications en temps réel.",
    points: [
      "Titres, tableaux, encadrés, images, PDF, diagrammes Mermaid, Draw.io, Excalidraw",
      "« Dictée vocale » (Ctrl+Maj+V) pour écrire à la voix",
      "« Historique de la page » pour comparer et restaurer une version",
    ],
  },
  {
    chapter: "Collaborer",
    title: "Commentez, mentionnez, suivez",
    body: "Sélectionnez un passage puis « Commentaire » pour en discuter. Les personnes mentionnées sont prévenues, et vous suivez les pages qui vous intéressent.",
    points: [
      "Panneau « Commentaires » : onglets Ouvert et Résolu, « Répondre… », « Résoudre le commentaire »",
      "« @ » dans un commentaire prévient la personne (cloche et accueil « À traiter »)",
      "« Suivre la page » ou « Suivre l'espace » pour être averti des changements",
    ],
  },
  {
    chapter: "Partager",
    title: "Partagez au bon niveau",
    body: "« Partager » règle qui voit et qui modifie une page. L'historique garde chaque version.",
    points: [
      "Onglet « Accès » : restreindre la page, « Peut modifier » ou « Peut voir »",
      "Onglet « Publier » : un lien public, si votre espace l'autorise",
      "Rôles d'espace : Accès complet, Peut modifier, Peut voir",
    ],
  },
  {
    chapter: "Vérifier",
    title: "Vérifiez vos pages de référence",
    body: "Une page vérifiée est une page de confiance : c'est la seule que « Demander à l'IA » utilise. La vérification se renouvelle selon la période choisie.",
    points: [
      "Badge sous le titre ; « Vérifier la page » avec « J'ai vérifié l'exactitude de cette page »",
      "Statuts : Vérifié, Révision nécessaire, Vérification expirée",
      "Modifier une page vérifiée la remet en brouillon : elle sort des réponses de l'IA jusqu'à sa revérification",
    ],
  },
  {
    chapter: "Approuver",
    title: "Faites approuver les pages sensibles",
    body: "Pour une politique ou une procédure officielle, le flux d'approbation impose une validation avant publication. Chaque étape prévient la bonne personne.",
    points: [
      "Brouillon, puis « Soumettre pour approbation », puis En approbation, puis Approuvé",
      "Les vérificateurs choisissent « Approuver » ou « Rejeter », avec un commentaire",
      "Une page obsolète se marque comme telle sans être supprimée",
    ],
  },
  {
    chapter: "Retrouver",
    title: "Retrouvez tout avec Ctrl + K",
    body: "La palette de recherche cherche dans les pages, les pièces jointes, les réunions publiées et les tâches ConqrPlan.",
    points: [
      "Filtres « Espace » et « Type » (Pages, Pièces jointes)",
      "Groupe « Réunions » : « Page publiée » ou « Ouvrir dans ConqrMeet »",
      "« Réponses IA » transforme la recherche en question, avec réponse sourcée",
    ],
  },
  {
    chapter: "Demander à l'IA",
    title: "Demandez à l'IA, preuves à l'appui",
    body: "Le « Chat IA » répond à partir des pages vérifiées de vos espaces et cite chaque source. Une page non vérifiée n'est jamais utilisée.",
    points: [
      "Mode « Rapide » ou « Approfondi », portée : tout l'espace de travail ou un espace",
      "Chaque source indique « Vérifié par… » et un niveau de fiabilité",
      "« Enregistrer en page » transforme une bonne réponse en page",
    ],
  },
  {
    chapter: "Réunions",
    title: "Les réunions publiées depuis ConqrMeet",
    body: "Quand une réunion est publiée, ConqrHub reçoit une page de réunion, ses documents et la transcription. Elles se retrouvent, se commentent et se partagent comme toutes les pages.",
    points: [
      "Page de réunion : résumé, prochaines étapes, évaluation validée",
      "Sous-pages : chaque document et « Transcription — … » avec les moments marqués",
      "L'accueil signale les réunions à vérifier ou prêtes à publier",
    ],
  },
  {
    chapter: "ConqrPlan",
    title: "Reliez le savoir et le travail",
    body: "Un passage d'une page peut devenir une exigence ou une tâche ConqrPlan. Le panneau « Travaux et connaissances liés » montre ce qui est couvert.",
    points: [
      "Sélectionnez un passage : « Marquer comme exigence » ou « Créer un élément de travail »",
      "« Couverture de livraison » : Couverte, Non couverte, Provisoire",
      "Le sélecteur d'applications ouvre le projet ConqrPlan de l'espace",
    ],
  },
  {
    chapter: "Notifications",
    title: "Restez informé, à votre rythme",
    body: "La cloche regroupe ce qui vous concerne dans ConqrHub et ConqrMeet. Vos préférences règlent la langue, le thème et les e-mails.",
    points: [
      "Cloche : « Direct », « Mises à jour », « Suite » et « Non lues uniquement »",
      "Mon compte › Préférences : langue, thème, largeur des pages",
      "Mon compte › Notifications : e-mails et sons, par catégorie ; « Mes réunions » pour ConqrMeet",
    ],
  },
  {
    chapter: "Prêt",
    title: "Tout est prêt",
    body: "Commencez par votre espace, ou posez votre première question à l'IA.",
    points: [
      "Ctrl + K pour retrouver une page, une réunion ou une tâche",
      "La cloche et l'accueil « À traiter » vous disent quoi faire ensuite",
      "Pour revoir cette visite : menu du compte › « Revoir la visite guidée »",
    ],
    adminPoints: [
      "« Inviter des membres » depuis le menu de l'espace de travail ; Paramètres › Membres et groupes",
      "« Base de connaissances IA » : pages à vérifier, couverture par espace",
      "« Santé de la documentation » : score, problèmes à corriger, alertes",
    ],
    adminBody:
      "Commencez par votre espace, ou posez votre première question à l'IA. Comme responsable, quelques outils en plus :",
  },
];
