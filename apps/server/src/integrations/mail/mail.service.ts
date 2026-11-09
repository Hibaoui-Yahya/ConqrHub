import { Inject, Injectable } from '@nestjs/common';
import { MAIL_DRIVER_TOKEN } from './mail.constants';
import { MailDriver } from './drivers/interfaces/mail-driver.interface';
import { MailMessage } from './interfaces/mail.message';
import { EnvironmentService } from '../environment/environment.service';
import { InjectQueue } from '@nestjs/bullmq';
import { QueueName, QueueJob } from '../queue/constants';
import { Queue } from 'bullmq';
import { render } from '@react-email/render';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { sql } from 'kysely';

@Injectable()
export class MailService {
  constructor(
    @Inject(MAIL_DRIVER_TOKEN) private mailDriver: MailDriver,
    private readonly environmentService: EnvironmentService,
    @InjectQueue(QueueName.EMAIL_QUEUE) private emailQueue: Queue,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  /**
   * Sender name. Self-hosted deployments have one workspace, whose owners
   * can set it in Paramètres › Entreprise › Général; MAIL_FROM_NAME stays
   * the fallback (and the only source in cloud mode).
   */
  private async resolveFromName(): Promise<string> {
    const fallback = this.environmentService.getMailFromName();
    if (this.environmentService.isCloud()) return fallback;
    try {
      const row = await this.db
        .selectFrom('workspaces')
        .select([
          sql<string | null>`settings->'general'->>'mailFromName'`.as(
            'mailFromName',
          ),
        ])
        .where('deletedAt', 'is', null)
        .orderBy('createdAt', 'asc')
        .limit(1)
        .executeTakeFirst();
      const name = row?.mailFromName?.trim();
      return name ? name.replace(/[\r\n<>]/g, ' ') : fallback;
    } catch {
      return fallback;
    }
  }

  async sendEmail(message: MailMessage): Promise<void> {
    if (message.template) {
      // in case this method is used directly. we do not send the tsx template from queue
      message.html = await render(message.template, {
        pretty: true,
      });
      message.text = await render(message.template, { plainText: true });
    }

    let from = this.environmentService.getMailFromAddress();
    if (message.from) {
      from = message.from;
    }

    const sender = `${await this.resolveFromName()} <${from}> `;
    await this.mailDriver.sendMail({ from: sender, ...message });
  }

  async sendToQueue(message: MailMessage): Promise<void> {
    if (message.template) {
      // transform the React object because it gets lost when sent via the queue
      message.html = await render(message.template, {
        pretty: true,
      });
      message.text = await render(message.template, {
        plainText: true,
      });
      delete message.template;
    }
    await this.emailQueue.add(QueueJob.SEND_EMAIL, message);
  }
}
