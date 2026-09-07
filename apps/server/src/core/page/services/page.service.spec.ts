import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { KYSELY_MODULE_CONNECTION_TOKEN } from 'nestjs-kysely';
import { PageService } from './page.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { StorageService } from '../../../integrations/storage/storage.service';
import { CollaborationGateway } from '../../../collaboration/collaboration.gateway';
import { WatcherService } from '../../watcher/watcher.service';
import { QueueName } from '../../../integrations/queue/constants';

describe('PageService', () => {
  let service: PageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PageService,
        { provide: PageRepo, useValue: {} },
        { provide: PagePermissionRepo, useValue: {} },
        { provide: AttachmentRepo, useValue: {} },
        { provide: KYSELY_MODULE_CONNECTION_TOKEN(), useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: getQueueToken(QueueName.ATTACHMENT_QUEUE), useValue: {} },
        { provide: getQueueToken(QueueName.AI_QUEUE), useValue: {} },
        { provide: getQueueToken(QueueName.GENERAL_QUEUE), useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: CollaborationGateway, useValue: {} },
        { provide: WatcherService, useValue: {} },
      ],
    }).compile();

    service = module.get<PageService>(PageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
