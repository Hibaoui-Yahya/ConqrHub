import { Test, TestingModule } from '@nestjs/testing';
import { KYSELY_MODULE_CONNECTION_TOKEN } from 'nestjs-kysely';
import { GroupService } from './group.service';
import { GroupUserService } from './group-user.service';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import { GroupUserRepo } from '@docmost/db/repos/group/group-user.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { WatcherRepo } from '@docmost/db/repos/watcher/watcher.repo';
import { FavoriteRepo } from '@docmost/db/repos/favorite/favorite.repo';
import { AUDIT_SERVICE } from '../../../integrations/audit/audit.service';

describe('GroupService', () => {
  let service: GroupService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupService,
        { provide: GroupRepo, useValue: {} },
        { provide: GroupUserRepo, useValue: {} },
        { provide: SpaceMemberRepo, useValue: {} },
        { provide: GroupUserService, useValue: {} },
        { provide: WatcherRepo, useValue: {} },
        { provide: FavoriteRepo, useValue: {} },
        { provide: KYSELY_MODULE_CONNECTION_TOKEN(), useValue: {} },
        { provide: AUDIT_SERVICE, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get<GroupService>(GroupService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
