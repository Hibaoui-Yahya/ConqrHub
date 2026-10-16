import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import {
  AI_CHAT_THROTTLER,
  AUTH_THROTTLER,
} from '../../integrations/throttle/throttler-names';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './services/auth.service';
import { SessionService } from '../session/session.service';
import { SetupGuard } from './guards/setup.guard';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { PasswordResetDto } from './dto/password-reset.dto';
import { VerifyUserTokenDto } from './dto/verify-user-token.dto';
import { FastifyReply, FastifyRequest } from 'fastify';
import { validateSsoEnforcement } from './auth.util';
import { ModuleRef } from '@nestjs/core';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { TokenService } from './services/token.service';
import { JwtType } from './dto/jwt-payload';
import { AuthStateUnavailableException } from './services/hub-session-validator.service';
import { clearAuthCookie, setAuthCookie } from './auth-cookie.util';
import { LogoutDto } from './dto/logout.dto';

@SkipThrottle({ [AI_CHAT_THROTTLER]: true })
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private authService: AuthService,
    private sessionService: SessionService,
    private environmentService: EnvironmentService,
    private moduleRef: ModuleRef,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
    private tokenService: TokenService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
    @Body() loginInput: LoginDto,
  ) {
    validateSsoEnforcement(workspace);

    let MfaModule: any;
    let isMfaModuleReady = false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      MfaModule = require('./../../ee/mfa/services/mfa.service');
      isMfaModuleReady = true;
    } catch (err) {
      this.logger.debug(
        'MFA module requested but EE module not bundled in this build',
      );
      isMfaModuleReady = false;
    }
    if (isMfaModuleReady) {
      const mfaService = this.moduleRef.get(MfaModule.MfaService, {
        strict: false,
      });

      const mfaResult = await mfaService.checkMfaRequirements(
        loginInput,
        workspace,
        res,
      );

      // mfaResult === null/undefined => MFA module loaded but no MFA configured
      // for this workspace and credentials were NOT verified by the MFA path.
      // Fall through to plain login below — this is the only path that may
      // call authService.login.
      if (mfaResult) {
        // MFA module took ownership of credential verification. From here we
        // must NEVER call authService.login again (doing so re-runs bcrypt
        // and creates a second session for the same request).
        if (mfaResult.userHasMfa || mfaResult.requiresMfaSetup) {
          return {
            userHasMfa: mfaResult.userHasMfa,
            requiresMfaSetup: mfaResult.requiresMfaSetup,
            isMfaEnforced: mfaResult.isMfaEnforced,
          };
        }
        if (mfaResult.authToken) {
          this.setAuthCookie(res, mfaResult.authToken);
          return;
        }
        // MFA returned a truthy result we don't recognize. Credentials were
        // already consumed by MFA; refuse rather than silently re-logging in.
        this.logger.warn('Unexpected mfaResult shape; refusing fallback login');
        throw new UnauthorizedException();
      }
    }

    const authToken = await this.authService.login(loginInput, workspace.id);
    this.setAuthCookie(res, authToken);
  }

  @UseGuards(SetupGuard)
  @HttpCode(HttpStatus.OK)
  @Post('setup')
  async setupWorkspace(
    @Res({ passthrough: true }) res: FastifyReply,
    @Body() createAdminUserDto: CreateAdminUserDto,
  ) {
    const { workspace, authToken } =
      await this.authService.setup(createAdminUserDto);

    this.setAuthCookie(res, authToken);
    return workspace;
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('change-password')
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Req() req: FastifyRequest,
  ) {
    const currentSessionId = (req.raw as any).sessionId;
    return this.authService.changePassword(
      dto,
      user.id,
      workspace.id,
      currentSessionId,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    validateSsoEnforcement(workspace);
    return this.authService.forgotPassword(forgotPasswordDto, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('password-reset')
  async passwordReset(
    @Res({ passthrough: true }) res: FastifyReply,
    @Body() passwordResetDto: PasswordResetDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const result = await this.authService.passwordReset(
      passwordResetDto,
      workspace,
    );

    if (result.requiresLogin) {
      return {
        requiresLogin: true,
      };
    }

    // Set auth cookie if no MFA is required
    this.setAuthCookie(res, result.authToken);
    return {
      requiresLogin: false,
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('verify-token')
  async verifyResetToken(
    @Body() verifyUserTokenDto: VerifyUserTokenDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.authService.verifyUserToken(verifyUserTokenDto, workspace.id);
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('collab-token')
  async collabToken(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.authService.getCollabToken(user, workspace.id);
  }

  /**
   * Ends this browser's Hub session. It deliberately does not require a valid
   * session: a cookie whose session was already revoked (another device, a
   * password reset) must still be cleared, otherwise the browser keeps a
   * credential the sign-in page and the suite IdP keep tripping over.
   * Revocation is authoritative: if it cannot be recorded the request fails
   * with 503 and the cookie is left in place, so the user is never told they
   * are signed out while the session is still live.
   */
  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
    @Body() body: LogoutDto = {},
  ) {
    const claims = await this.readSessionClaims(req);
    if (claims && (claims.sessionId || body?.allDevices)) {
      try {
        if (body?.allDevices) {
          await this.sessionService.revokeAllSessions(
            claims.sub,
            claims.workspaceId,
          );
        } else {
          await this.sessionService.revokeSession(
            claims.sessionId,
            claims.sub,
            claims.workspaceId,
          );
        }
      } catch (err) {
        this.logger.error(
          `Logout could not revoke the session: ${(err as Error)?.message ?? err}`,
        );
        throw new AuthStateUnavailableException();
      }
    }

    clearAuthCookie(res, this.environmentService);

    if (claims) {
      this.auditService.log({
        event: AuditEvent.USER_LOGOUT,
        resourceType: AuditResource.USER,
        resourceId: claims.sub,
      });
    }
  }

  /**
   * Claims of the session cookie when it is genuinely ours: valid signature,
   * access type, and minted for the workspace this request resolved to.
   * Expiry is ignored so an expired cookie can still end its own session.
   */
  private async readSessionClaims(
    req: FastifyRequest,
  ): Promise<{ sub: string; workspaceId: string; sessionId?: string } | null> {
    const token = (req as any).cookies?.authToken;
    if (!token) return null;
    try {
      const payload = await this.tokenService.verifyJwt(
        token,
        JwtType.ACCESS,
        { ignoreExpiration: true },
      );
      const workspaceId = (req.raw as any).workspaceId;
      if (!payload?.sub || payload.workspaceId !== workspaceId) return null;
      return {
        sub: payload.sub,
        workspaceId: payload.workspaceId,
        sessionId: payload.sessionId,
      };
    } catch {
      return null;
    }
  }

  setAuthCookie(res: FastifyReply, token: string) {
    setAuthCookie(res, this.environmentService, token);
  }
}
