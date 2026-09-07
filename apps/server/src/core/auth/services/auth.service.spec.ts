import { Test, TestingModule } from '@nestjs/testing';
import { KYSELY_MODULE_CONNECTION_TOKEN } from 'nestjs-kysely';
import { AuthService } from './auth.service';
import { SignupService } from './signup.service';
import { TokenService } from './token.service';
import { SessionService } from '../../session/session.service';
import { UserSessionRepo } from '@docmost/db/repos/session/user-session.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { UserTokenRepo } from '@docmost/db/repos/user-token/user-token.repo';
import { MailService } from '../../../integrations/mail/mail.service';
import { DomainService } from '../../../integrations/environment/domain.service';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { AUDIT_SERVICE } from '../../../integrations/audit/audit.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: SignupService, useValue: {} },
        { provide: TokenService, useValue: {} },
        { provide: SessionService, useValue: {} },
        { provide: UserSessionRepo, useValue: {} },
        { provide: UserRepo, useValue: {} },
        { provide: UserTokenRepo, useValue: {} },
        { provide: MailService, useValue: {} },
        { provide: DomainService, useValue: {} },
        { provide: EnvironmentService, useValue: {} },
        { provide: KYSELY_MODULE_CONNECTION_TOKEN(), useValue: {} },
        { provide: AUDIT_SERVICE, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
