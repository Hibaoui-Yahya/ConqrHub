import {
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  clearAuthCookie,
  usesAuthCookie,
} from '../../core/auth/auth-cookie.util';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Reflector } from '@nestjs/core';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { addDays } from 'date-fns';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private environmentService: EnvironmentService,
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, ctx: ExecutionContext) {
    if (err || !user) {
      // A session cookie that no longer authenticates (revoked, expired,
      // other workspace) is cleared on the 401, so the browser stops sending
      // it and the sign-in page cannot bounce on it. An outage (503) is NOT a
      // logout: the cookie is kept and the client retries.
      if (!(err instanceof ServiceUnavailableException)) {
        this.clearStaleSessionCookie(ctx);
      }
      throw err || new UnauthorizedException();
    }

    this.setJoinedWorkspacesCookie(user, ctx);
    return user;
  }

  private clearStaleSessionCookie(ctx: ExecutionContext) {
    if (ctx.getType() !== 'http') return;
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    if (usesAuthCookie(req) && typeof res?.clearCookie === 'function') {
      clearAuthCookie(res, this.environmentService);
    }
  }

  setJoinedWorkspacesCookie(user: any, ctx: ExecutionContext) {
    if (this.environmentService.isCloud()) {
      const req = ctx.switchToHttp().getRequest();
      const res = ctx.switchToHttp().getResponse();

      const workspaceId = user?.workspace?.id;
      let workspaceIds: string[] = [];
      try {
        const parsed = req.cookies.joinedWorkspaces
          ? JSON.parse(req.cookies.joinedWorkspaces)
          : [];
        if (Array.isArray(parsed)) {
          workspaceIds = parsed.filter((id) => typeof id === 'string');
        }
      } catch (err) {
        /* empty */
      }

      if (!workspaceIds.includes(workspaceId)) {
        workspaceIds.push(workspaceId);
      }

      // Cap the list so the cookie can't grow past the 4 KB browser limit
      // and silently break auth. Keep the most recent N (current entry is
      // pushed to the end above).
      const MAX_JOINED_WORKSPACES = 50;
      if (workspaceIds.length > MAX_JOINED_WORKSPACES) {
        workspaceIds = workspaceIds.slice(-MAX_JOINED_WORKSPACES);
      }

      res.setCookie('joinedWorkspaces', JSON.stringify(workspaceIds), {
        httpOnly: false,
        domain: '.' + this.environmentService.getSubdomainHost(),
        path: '/',
        expires: addDays(new Date(), 365),
        secure: this.environmentService.isHttps(),
      });
    }
  }
}
