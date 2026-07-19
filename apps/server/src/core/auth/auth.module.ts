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

@Module({
  imports: [TokenModule, WorkspaceModule],
  controllers: [AuthController, OidcController, SuiteIdpController],
  providers: [
    AuthService,
    SignupService,
    JwtStrategy,
    OidcAuthService,
    SuiteIdpService,
  ],
  exports: [SignupService],
})
export class AuthModule {}
