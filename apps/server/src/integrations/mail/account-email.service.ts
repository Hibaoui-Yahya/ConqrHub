import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { MailService } from './mail.service';
import { DomainService } from '../environment/domain.service';
import { EnvironmentService } from '../environment/environment.service';
import { EmailChangedEmail } from '@docmost/transactional/emails/email-changed-email';
import { NewSignInEmail } from '@docmost/transactional/emails/new-sign-in-email';
import { RoleChangedEmail } from '@docmost/transactional/emails/role-changed-email';
import { AccountDeactivatedEmail } from '@docmost/transactional/emails/account-deactivated-email';
import { roleLabelFr } from '@docmost/transactional/utils/utils';

interface Recipient {
  id: string;
  name?: string | null;
  email: string;
  workspaceId: string;
}

/**
 * Security and account e-mails sent as ConqrAI. They are service e-mails:
 * they bypass notification preferences, and they never throw, so a mail
 * outage cannot fail the action that triggered them.
 */
@Injectable()
export class AccountEmailService {
  private readonly logger = new Logger(AccountEmailService.name);

  constructor(
    private readonly mailService: MailService,
    private readonly domainService: DomainService,
    private readonly environmentService: EnvironmentService,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  private async workspace(workspaceId: string) {
    return this.db
      .selectFrom('workspaces')
      .select(['name', 'hostname'])
      .where('id', '=', workspaceId)
      .executeTakeFirst();
  }

  private async send(to: string, subject: string, template: any, what: string) {
    try {
      await this.mailService.sendToQueue({ to, subject, template });
    } catch (err) {
      this.logger.warn(
        `${what} e-mail not queued: ${(err as Error)?.message ?? err}`,
      );
    }
  }

  /** Sent to the OLD address once a self-service e-mail change is saved. */
  async emailChanged(user: Recipient, oldEmail: string, newEmail: string) {
    if (!oldEmail || oldEmail === newEmail) return;
    const ws = await this.workspace(user.workspaceId).catch(() => undefined);
    await this.send(
      oldEmail,
      "L'adresse e-mail de votre compte a été modifiée",
      EmailChangedEmail({
        userName: user.name ?? undefined,
        oldEmail,
        newEmail,
        changedAt: new Date(),
        secureUrl: `${this.domainService.getUrl(ws?.hostname)}/forgot-password`,
      }),
      'email-changed',
    );
  }

  /**
   * Sign-in from a device this account has never used. The first session of
   * an account (just after an invitation) is not reported.
   */
  async signInIfNewDevice(
    user: Recipient,
    session: {
      id: string;
      deviceName: string | null;
      ipAddress: string | null;
    },
  ) {
    try {
      const previous = await this.db
        .selectFrom('userSessions')
        .select(['deviceName'])
        .where('userId', '=', user.id)
        .where('workspaceId', '=', user.workspaceId)
        .where('id', '!=', session.id)
        .execute();
      if (previous.length === 0) return;
      if (previous.some((s) => s.deviceName === session.deviceName)) return;
    } catch (err) {
      this.logger.warn(
        `new-device check failed: ${(err as Error)?.message ?? err}`,
      );
      return;
    }
    const ws = await this.workspace(user.workspaceId).catch(() => undefined);
    await this.send(
      user.email,
      'Nouvelle connexion à votre compte ConqrAI',
      NewSignInEmail({
        userName: user.name ?? undefined,
        deviceName: session.deviceName ?? undefined,
        ipAddress: session.ipAddress ?? undefined,
        signedInAt: new Date(),
        secureUrl: `${this.domainService.getUrl(ws?.hostname)}/forgot-password`,
        recipient: user.email,
      }),
      'new-sign-in',
    );
  }

  async roleChanged(
    user: Recipient,
    actorName: string,
    oldRole: string,
    newRole: string,
  ) {
    const ws = await this.workspace(user.workspaceId).catch(() => undefined);
    const newLabel = roleLabelFr(newRole);
    await this.send(
      user.email,
      `Votre rôle${ws?.name ? ` dans ${ws.name}` : ''} a changé`,
      RoleChangedEmail({
        userName: user.name ?? undefined,
        actorName,
        workspaceName: ws?.name ?? undefined,
        oldRoleLabel: roleLabelFr(oldRole),
        newRoleLabel: newLabel,
        appUrl: this.domainService.getUrl(ws?.hostname),
        recipient: user.email,
      }),
      'role-changed',
    );
  }

  /** Deactivation or deletion; call before the deletion rewrites the e-mail. */
  async accessRemoved(user: Recipient, deleted = false) {
    const ws = await this.workspace(user.workspaceId).catch(() => undefined);
    await this.send(
      user.email,
      deleted
        ? `Votre compte${ws?.name ? ` dans ${ws.name}` : ''} a été supprimé`
        : `Votre accès${ws?.name ? ` à ${ws.name}` : ''} a été désactivé`,
      AccountDeactivatedEmail({
        userName: user.name ?? undefined,
        workspaceName: ws?.name ?? undefined,
        deactivatedAt: new Date(),
        deleted,
        meetEnabled: Boolean(this.environmentService.getMeetAppUrl()),
        recipient: user.email,
      }),
      'access-removed',
    );
  }
}
