import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueName } from '../../integrations/queue/constants';
import { PageVerificationController } from './page-verification.controller';
import { PageVerificationService } from './page-verification.service';
import { PageVerificationSchedulerService } from './page-verification-scheduler.service';

@Module({
  imports: [BullModule.registerQueue({ name: QueueName.AI_QUEUE })],
  controllers: [PageVerificationController],
  providers: [PageVerificationService, PageVerificationSchedulerService],
  exports: [PageVerificationService, PageVerificationSchedulerService],
})
export class PageVerificationModule {}
