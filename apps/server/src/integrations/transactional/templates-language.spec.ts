import { render } from '@react-email/render';
import type { MailLanguage } from './i18n';
import { AccountDeactivatedEmail } from './emails/account-deactivated-email';
import { ApprovalApprovedEmail } from './emails/approval-approved-email';
import { ApprovalRejectedEmail } from './emails/approval-rejected-email';
import { ApprovalRequestedEmail } from './emails/approval-requested-email';
import { ChangePasswordEmail } from './emails/change-password-email';
import { CommentCreateEmail } from './emails/comment-created-email';
import { CommentMentionEmail } from './emails/comment-mention-email';
import { CommentResolvedEmail } from './emails/comment-resolved-email';
import { DocHealthDroppedEmail } from './emails/doc-health-dropped-email';
import { EmailChangedEmail } from './emails/email-changed-email';
import { ForgotPasswordEmail } from './emails/forgot-password-email';
import { InvitationAcceptedEmail } from './emails/invitation-accepted-email';
import { InvitationEmail } from './emails/invitation-email';
import { MeetingFailedEmail } from './emails/meeting-failed-email';
import { MeetingReadyEmail } from './emails/meeting-ready-email';
import { NewSignInEmail } from './emails/new-sign-in-email';
import { PageMentionEmail } from './emails/page-mention-email';
import { PageUpdateDigestEmail } from './emails/page-update-digest-email';
import { PageUpdateEmail } from './emails/page-update-email';
import { PermissionGrantedEmail } from './emails/permission-granted-email';
import { RoleChangedEmail } from './emails/role-changed-email';
import { VerificationExpiredEmail } from './emails/verification-expired-email';
import { VerificationExpiringEmail } from './emails/verification-expiring-email';
import { WelcomeEmail } from './emails/welcome-email';

/**
 * Every template in both languages, with plain ASCII data so that any
 * accent or French quote in the English rendering is a leftover.
 */
const page = {
  actorName: 'Alex Admin',
  pageTitle: 'Onboarding',
  pageUrl: 'https://hub.example.com/p/abc',
  spaceName: 'HR',
};
const date = '2026-10-14T08:42:00Z';

const TEMPLATES: Array<[string, (lang: MailLanguage) => any, string, string]> = [
  ['account-deactivated', (lang) => AccountDeactivatedEmail({ lang, userName: 'Sam', workspaceName: 'Acme', deactivatedAt: date, meetEnabled: true }), 'Votre accès a été désactivé', 'Your access has been deactivated'],
  ['approval-approved', (lang) => ApprovalApprovedEmail({ lang, userName: 'Sam', ...page }), 'Votre page est approuvée', 'Your page is approved'],
  ['approval-rejected', (lang) => ApprovalRejectedEmail({ lang, ...page, comment: 'Please add a summary' }), 'Des modifications sont demandées', 'Changes are requested'],
  ['approval-requested', (lang) => ApprovalRequestedEmail({ lang, ...page, submittedAt: 'today' }), 'Une page attend votre approbation', 'A page is waiting for your approval'],
  ['change-password', (lang) => ChangePasswordEmail({ lang, username: 'Sam', changedAt: date, secureUrl: 'https://x/forgot-password' }), 'Votre mot de passe a été modifié', 'Your password has been changed'],
  ['comment-created', (lang) => CommentCreateEmail({ lang, ...page, excerpt: 'Looks good', isReply: true }), 'Nouvelle réponse', 'New reply'],
  ['comment-mention', (lang) => CommentMentionEmail({ lang, ...page, excerpt: 'Can you check' }), 'Nouvelle mention dans un commentaire', 'New mention in a comment'],
  ['comment-resolved', (lang) => CommentResolvedEmail({ lang, ...page, excerpt: 'Typo' }), 'Commentaire résolu', 'Comment resolved'],
  ['doc-health-dropped', (lang) => DocHealthDroppedEmail({ lang, scopeLabel: 'HR', score: 52, threshold: 70, dashboardUrl: 'https://x' }), 'La santé documentaire baisse', 'Documentation health is dropping'],
  ['email-changed', (lang) => EmailChangedEmail({ lang, userName: 'Sam', oldEmail: 'old@example.com', newEmail: 'new@example.com', changedAt: date, secureUrl: 'https://x' }), 'Votre adresse e-mail a changé', 'Your e-mail address has changed'],
  ['forgot-password', (lang) => ForgotPasswordEmail({ lang, username: 'Sam', resetLink: 'https://x/reset' }), 'Réinitialisez votre mot de passe', 'Reset your password'],
  ['invitation-accepted', (lang) => InvitationAcceptedEmail({ lang, invitedUserName: 'Kim', invitedUserEmail: 'kim@example.com', inviterName: 'Sam', workspaceName: 'Acme', roleLabel: 'Member', membersUrl: 'https://x' }), "Kim a rejoint l'espace", 'Kim joined the workspace'],
  ['invitation', (lang) => InvitationEmail({ lang, inviteLink: 'https://x/invite', invitedByName: 'Sam', workspaceName: 'Acme', roleLabel: 'Member', meetEnabled: true }), "Rejoignez l'espace Acme", 'Join the Acme workspace'],
  ['meeting-failed', (lang) => MeetingFailedEmail({ lang, userName: 'Sam', meetingTitle: 'Weekly', meetingUrl: 'https://x', startedAt: 'today', failureReason: 'timeout', reference: 'MTG-1' }), "Nous n'avons pas pu traiter l'enregistrement", "We couldn't process the recording"],
  ['meeting-ready', (lang) => MeetingReadyEmail({ lang, userName: 'Sam', meetingTitle: 'Weekly', meetingUrl: 'https://x', startedAt: 'today', durationLabel: '45 min', proposals: Array.from({ length: 8 }, (_, i) => ({ title: `Task ${i}` })) }), 'Votre compte rendu est prêt', 'Your minutes are ready'],
  ['new-sign-in', (lang) => NewSignInEmail({ lang, userName: 'Sam', deviceName: 'Firefox on Linux', ipAddress: '81.250.12.34', signedInAt: date, secureUrl: 'https://x' }), 'Nouvelle connexion détectée', 'New sign-in detected'],
  ['page-mention', (lang) => PageMentionEmail({ lang, ...page, excerpt: 'see here' }), 'Nouvelle mention dans une page', 'New mention in a page'],
  ['page-update-digest', (lang) => PageUpdateDigestEmail({ lang, userName: 'Sam', totalUpdates: 3, pageUpdates: [1, 2, 3].map((i) => ({ title: `Page ${i}`, url: 'https://x', updatedBy: ['Alex'], spaceName: 'HR' })) }), 'Votre résumé des mises à jour', 'Your update digest'],
  ['page-update', (lang) => PageUpdateEmail({ lang, userName: 'Sam', ...page }), 'Une page que vous suivez a changé', 'A page you follow has changed'],
  ['permission-granted', (lang) => PermissionGrantedEmail({ lang, ...page, accessLabel: 'edit' }), 'Vous avez accès à une nouvelle page', 'You have access to a new page'],
  ['role-changed', (lang) => RoleChangedEmail({ lang, userName: 'Sam', actorName: 'Alex', workspaceName: 'Acme', oldRoleLabel: 'Member', newRoleLabel: 'Admin', appUrl: 'https://x' }), 'Vos accès ont été mis à jour', 'Your access has been updated'],
  ['verification-expired', (lang) => VerificationExpiredEmail({ lang, ...page }), 'La vérification a expiré', 'The verification has expired'],
  ['verification-expiring', (lang) => VerificationExpiringEmail({ lang, ...page, expiresAt: 'October 21, 2026' }), 'Une vérification arrive à échéance', 'A verification is about to expire'],
  ['welcome', (lang) => WelcomeEmail({ lang, userName: 'Sam', workspaceName: 'Acme', appUrl: 'https://x', meetEnabled: true }), "Bienvenue dans l'espace Acme", 'Welcome to the Acme workspace'],
];

describe('e-mail templates in both languages', () => {
  it('covers every template', () => {
    expect(TEMPLATES).toHaveLength(24);
  });

  it.each(TEMPLATES)('%s: French keeps its French wording', async (_name, build, fr) => {
    const html = await render(build('fr'));
    const text = await render(build('fr'), { plainText: true });
    expect(text).toContain(fr);
    expect(html).toContain('lang="fr"');
  });

  it.each(TEMPLATES)('%s: English has no French left', async (_name, build, _fr, en) => {
    const html = await render(build('en'));
    const text = await render(build('en'), { plainText: true });
    expect(text).toContain(en);
    expect(html).toContain('lang="en"');
    expect(text).not.toMatch(/[àâçéèêëîïôûùüœÀÉ«»]/);
    expect(text).not.toMatch(/\b(Bonjour|Vous|votre|vos|une|des|Espace|Ouvrir)\b/);
  });
});
