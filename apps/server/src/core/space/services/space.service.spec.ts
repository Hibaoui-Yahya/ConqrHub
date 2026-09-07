import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { KYSELY_MODULE_CONNECTION_TOKEN } from 'nestjs-kysely';
import { SpaceService } from './space.service';
import { SpaceMemberService } from './space-member.service';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { ShareRepo } from '@docmost/db/repos/share/share.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { LicenseCheckService } from '../../../integrations/environment/license-check.service';
import { QueueName } from '../../../integrations/queue/constants';
import { AUDIT_SERVICE } from '../../../integrations/audit/audit.service';

describe('SpaceService', () => {
  let service: SpaceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpaceService,
        { provide: SpaceRepo, useValue: {} },
        { provide: SpaceMemberService, useValue: {} },
        { provide: ShareRepo, useValue: {} },
        { provide: WorkspaceRepo, useValue: {} },
        { provide: LicenseCheckService, useValue: {} },
        { provide: KYSELY_MODULE_CONNECTION_TOKEN(), useValue: {} },
        { provide: getQueueToken(QueueName.ATTACHMENT_QUEUE), useValue: {} },
        { provide: AUDIT_SERVICE, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get<SpaceService>(SpaceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
