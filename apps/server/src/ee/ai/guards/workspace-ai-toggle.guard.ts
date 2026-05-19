import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Workspace } from '@docmost/db/types/entity.types';
import {
  AI_FEATURE_DEFAULTS,
  AI_FEATURE_KEY,
  AiFeature,
} from '../feature.constants';

/**
 * Reads workspace.settings.ai.<feature> and rejects with 403 if the surface
 * is disabled for this workspace. Use via @RequireAiFeature('chat') etc.
 */
@Injectable()
export class WorkspaceAiToggleGuard implements CanActivate {
  private readonly logger = new Logger(WorkspaceAiToggleGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AiFeature | undefined>(
      AI_FEATURE_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required) return true;

    const req = ctx.switchToHttp().getRequest();
    const workspace: Workspace | undefined =
      req.raw?.workspace ?? req?.user?.workspace;
    if (!workspace) {
      this.logger.warn(
        `Denied "${required}": missing workspace context url=${req?.url}`,
      );
      throw new ForbiddenException('Missing workspace context');
    }

    const settings = (workspace.settings ?? {}) as {
      ai?: Partial<Record<AiFeature, boolean>>;
    };
    const stored = settings.ai?.[required];
    const enabled = stored ?? AI_FEATURE_DEFAULTS[required];
    if (!enabled) {
      this.logger.warn(
        `Denied "${required}": stored=${JSON.stringify(stored)} default=${AI_FEATURE_DEFAULTS[required]} ws=${workspace.id}`,
      );
      throw new ForbiddenException(
        `AI feature "${required}" is disabled for this workspace`,
      );
    }
    return true;
  }
}
