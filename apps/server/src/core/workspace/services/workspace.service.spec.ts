import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { KYSELY_MODULE_CONNECTION_TOKEN } from 'nestjs-kysely';
import { WorkspaceService } from './workspace.service';
import { SpaceService } from '../../space/services/space.service';
import { SpaceMemberService } from '../../space/services/space-member.service';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import { GroupUserRepo } from '@docmost/db/repos/group/group-user.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { ShareRepo } from '@docmost/db/repos/share/share.repo';
import { WatcherRepo } from '@docmost/db/repos/watcher/watcher.repo';
import { FavoriteRepo } from '@docmost/db/repos/favorite/favorite.repo';
import { UserSessionRepo } from '@docmost/db/repos/session/user-session.repo';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { DomainService } from '../../../integrations/environment/domain.service';
import { LicenseCheckService } from '../../../integrations/environment/license-check.service';
import { QueueName } from '../../../integrations/queue/constants';
import { AUDIT_SERVICE } from '../../../integrations/audit/audit.service';

describe('WorkspaceService', () => {
  let service: WorkspaceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceService,
        { provide: WorkspaceRepo, useValue: {} },
        { provide: SpaceService, useValue: {} },
        { provide: SpaceMemberService, useValue: {} },
        { provide: GroupRepo, useValue: {} },
        { provide: GroupUserRepo, useValue: {} },
        { provide: UserRepo, useValue: {} },
        { provide: EnvironmentService, useValue: {} },
        { provide: DomainService, useValue: {} },
        { provide: LicenseCheckService, useValue: {} },
        { provide: ShareRepo, useValue: {} },
        { provide: WatcherRepo, useValue: {} },
        { provide: FavoriteRepo, useValue: {} },
        { provide: KYSELY_MODULE_CONNECTION_TOKEN(), useValue: {} },
        { provide: getQueueToken(QueueName.ATTACHMENT_QUEUE), useValue: {} },
        { provide: getQueueToken(QueueName.BILLING_QUEUE), useValue: {} },
        { provide: getQueueToken(QueueName.AI_QUEUE), useValue: {} },
        { provide: AUDIT_SERVICE, useValue: { log: jest.fn() } },
        { provide: UserSessionRepo, useValue: {} },
      ],
    }).compile();

    service = module.get<WorkspaceService>(WorkspaceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
