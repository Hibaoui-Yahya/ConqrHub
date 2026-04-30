import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
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
      throw new ForbiddenException('Missing workspace context');
    }

    const settings = (workspace.settings ?? {}) as {
      ai?: Partial<Record<AiFeature, boolean>>;
    };
    const enabled = settings.ai?.[required] ?? AI_FEATURE_DEFAULTS[required];
    if (!enabled) {
      throw new ForbiddenException(
        `AI feature "${required}" is disabled for this workspace`,
      );
    }
    return true;
  }
}
