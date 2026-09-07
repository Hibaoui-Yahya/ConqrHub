import { Test, TestingModule } from '@nestjs/testing';
import { PageController } from './page.controller';
import { PageService } from './services/page.service';
import { PageHistoryService } from './services/page-history.service';
import { PagePermissionService } from './services/page-permission.service';
import { PageAccessService } from './page-access/page-access.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import { AUDIT_SERVICE } from '../../integrations/audit/audit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

describe('PageController', () => {
  let controller: PageController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PageController],
      providers: [
        { provide: PageService, useValue: {} },
        { provide: PageRepo, useValue: {} },
        { provide: PageHistoryService, useValue: {} },
        { provide: SpaceAbilityFactory, useValue: {} },
        { provide: PageAccessService, useValue: {} },
        { provide: PagePermissionService, useValue: {} },
        { provide: AUDIT_SERVICE, useValue: { log: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PageController>(PageController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
