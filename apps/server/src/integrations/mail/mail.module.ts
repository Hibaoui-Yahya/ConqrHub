import { DynamicModule, Global, Module } from '@nestjs/common';
import {
  mailDriverConfigProvider,
  mailDriverProvider,
} from './providers/mail.provider';
import { MailModuleOptions } from './interfaces';
import { MailService } from './mail.service';
import { AccountEmailService } from './account-email.service';
import { EmailProcessor } from './processors/email.processor';

@Global()
@Module({
  providers: [EmailProcessor],
})
export class MailModule {
  static forRootAsync(options: MailModuleOptions): DynamicModule {
    return {
      module: MailModule,
      imports: options.imports || [],
      providers: [
        mailDriverConfigProvider,
        mailDriverProvider,
        MailService,
        AccountEmailService,
      ],
      exports: [MailService, AccountEmailService],
    };
  }
}
