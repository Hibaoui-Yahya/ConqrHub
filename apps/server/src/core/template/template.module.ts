import { Module } from '@nestjs/common';
import { PageModule } from '../page/page.module';
import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';
import { TemplateRepo } from './template.repo';

@Module({
  imports: [PageModule],
  controllers: [TemplateController],
  providers: [TemplateService, TemplateRepo],
})
export class TemplateModule {}
