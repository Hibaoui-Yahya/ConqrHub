import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { extractBearerTokenFromHeader } from '../../../common/helpers';
import {
  DELEGATION_CORRELATION_HEADER,
  DELEGATION_HEADER,
  SuiteDelegatedScope,
} from '../domain/suite-delegation-scope';
import {
  DelegationContext,
  DelegationDenied,
  SuiteDelegationVerifierService,
} from '../services/suite-delegation-verifier.service';

export const DELEGATION_SCOPE_KEY = 'suiteDelegationScope';

/**
 * The scope a route requires of a delegated caller.
 *
 * Required, not optional: a route guarded by `SuiteDelegationGuard` with no
 * scope declared is refused rather than allowed, because the failure mode of
 * the other choice is a new endpoint that any valid assertion can reach.
 */
export const RequiresDelegationScope = (scope: SuiteDelegatedScope) =>
  SetMetadata(DELEGATION_SCOPE_KEY, scope);

/** The resolved identity, for a handler that has passed the guard. */
export const Delegation = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): DelegationContext =>
    ctx.switchToHttp().getRequest().raw.delegation,
);

/**
 * Admit a request from another suite product acting on behalf of a person.
 *
 * Deliberately not an extension of `JwtAuthGuard`. A Hub session and a
 * delegated assertion are different credentials resolved from different
 * sources, and folding the second into the Passport strategy would mean one
 * `validate` that has to be right about both — which is how a bug in one
 * becomes a way past the other.
 *
 * Refusals are uniform. Every classification the verifier produces comes back
 * as the same 401, with the reason in the audit trail and not in the response,
 * so a caller cannot probe which organisations, subjects or key ids exist by
 * reading the differences. The one exception is an insufficient scope, which
 * is a 403: the caller *is* who it says it is, and telling it that the token
 * it holds cannot do this is not a disclosure — it is the only way it can know
 * to ask for a different one.
 */
@Injectable()
export class SuiteDelegationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: SuiteDelegationVerifierService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    const requiredScope = this.reflector.getAllAndOverride<SuiteDelegatedScope>(
      DELEGATION_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredScope) {
      throw new UnauthorizedException('Delegated access is not available here');
    }

    const header = request.headers[DELEGATION_HEADER];
    const correlation = request.headers[DELEGATION_CORRELATION_HEADER];

    try {
      const delegation = await this.verifier.verify({
        token: Array.isArray(header) ? header[0] : header,
        clientToken: extractBearerTokenFromHeader(request),
        requiredScope,
        method: request.method,
        // The route *pattern* where Fastify exposes one, so the audit records
        // which endpoint was called without recording whatever ids were in the
        // URL. The two spellings are Fastify v5 and v4; the raw path is the
        // last resort and is already stripped of its query string.
        path:
          (request as any).routeOptions?.url ??
          (request as any).routerPath ??
          request.url?.split('?')[0],
        correlationId: Array.isArray(correlation) ? correlation[0] : correlation,
      });

      // On `raw` for the same reason the JWT strategy puts its own state there:
      // that is the object Nest's param decorators read back.
      (request.raw as any).delegation = delegation;

      // Shaped like what `JwtAuthGuard` leaves behind, so a handler and the
      // services under it see the same `{ user, workspace }` they would from a
      // signed-in request. A delegated call must exercise the *same*
      // permission checks, not a parallel set.
      (request as any).user = { user: delegation.user, workspace: delegation.workspace };
      (request.raw as any).workspaceId = delegation.workspace.id;

      return true;
    } catch (err) {
      if (err instanceof DelegationDenied) {
        if (err.classification === 'delegation_insufficient_scope') {
          throw new ForbiddenException('Insufficient delegated scope');
        }
        throw new UnauthorizedException('Delegated access denied');
      }
      throw err;
    }
  }
}
