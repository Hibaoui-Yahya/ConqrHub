import { Test, TestingModule } from '@nestjs/testing';
import { GroupController } from './group.controller';
import { GroupService } from './services/group.service';
import { GroupUserService } from './services/group-user.service';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

describe('GroupController', () => {
  let controller: GroupController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GroupController],
      providers: [
        { provide: GroupService, useValue: {} },
        { provide: GroupUserService, useValue: {} },
        { provide: WorkspaceAbilityFactory, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<GroupController>(GroupController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
