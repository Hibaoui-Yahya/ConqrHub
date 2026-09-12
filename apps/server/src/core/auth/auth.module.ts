import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './services/auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { WorkspaceModule } from '../workspace/workspace.module';
import { SignupService } from './services/signup.service';
import { TokenModule } from './token.module';
import { OidcController } from './oidc/oidc.controller';
import { OidcAuthService } from './oidc/oidc-auth.service';
import { SuiteIdpController } from './idp/suite-idp.controller';
import { SuiteIdpService } from './idp/suite-idp.service';
import { PlatformLoginService } from '../platform/platform-login.service';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [TokenModule, WorkspaceModule, SessionModule],
  controllers: [AuthController, OidcController, SuiteIdpController],
  providers: [
    AuthService,
    SignupService,
    JwtStrategy,
    OidcAuthService,
    SuiteIdpService,
    // The platform login path lives here rather than in PlatformModule, beside the signup and
    // session services it composes. PlatformModule is @Global, so its own services reach this one
    // without either module importing the other — which is what keeps the graph acyclic.
    PlatformLoginService,
  ],
  exports: [SignupService, PlatformLoginService],
})
export class AuthModule {}
