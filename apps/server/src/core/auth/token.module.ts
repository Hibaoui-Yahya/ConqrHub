import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { TokenService } from './services/token.service';
import { HubSessionValidator } from './services/hub-session-validator.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: async (environmentService: EnvironmentService) => {
        return {
          secret: environmentService.getAppSecret(),
          signOptions: {
            expiresIn: environmentService.getJwtTokenExpiresIn() as StringValue,
            issuer: 'ConqrAI Wiki',
          },
        };
      },
      inject: [EnvironmentService],
    }),
  ],
  providers: [TokenService, HubSessionValidator],
  // JwtModule is re-exported so AuthModule providers (e.g. the suite IdP) can
  // inject JwtService directly for custom-audience tokens.
  exports: [TokenService, HubSessionValidator, JwtModule],
})
export class TokenModule {}
