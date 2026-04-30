import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventName } from '../../common/events/event.contants';
import { QueueJob, QueueName } from '../../integrations/queue/constants';

export class InsightEvent {
  insightId: string;
  workspaceId: string;
  spaceId: string;
}

@Injectable()
export class ExpertInsightsListener {
  private readonly logger = new Logger(ExpertInsightsListener.name);

  constructor(
    @InjectQueue(QueueName.AI_QUEUE) private readonly aiQueue: Queue,
  ) {}

  @OnEvent(EventName.INSIGHT_CREATED)
  @OnEvent(EventName.INSIGHT_UPDATED)
  @OnEvent(EventName.INSIGHT_PUBLISHED)
  async handleInsightUpsert(event: InsightEvent) {
    await this.aiQueue.add(QueueJob.GENERATE_INSIGHT_EMBEDDINGS, {
      insightId: event.insightId,
      workspaceId: event.workspaceId,
      spaceId: event.spaceId,
    });
  }

  @OnEvent(EventName.INSIGHT_RETIRED)
  @OnEvent(EventName.INSIGHT_DELETED)
  async handleInsightRemoved(event: InsightEvent) {
    await this.aiQueue.add(QueueJob.DELETE_INSIGHT_EMBEDDINGS, {
      insightId: event.insightId,
    });
  }
}
