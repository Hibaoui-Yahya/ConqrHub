import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './services/auth.service';
import { SetupGuard } from './guards/setup.guard';
import { SessionService } from '../session/session.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { AUDIT_SERVICE } from '../../integrations/audit/audit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const passThrough = { canActivate: () => true };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: {} },
        { provide: SessionService, useValue: {} },
        { provide: EnvironmentService, useValue: {} },
        { provide: AUDIT_SERVICE, useValue: { log: jest.fn() } },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue(passThrough)
      .overrideGuard(SetupGuard)
      .useValue(passThrough)
      .overrideGuard(JwtAuthGuard)
      .useValue(passThrough)
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
