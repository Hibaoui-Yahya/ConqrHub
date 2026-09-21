import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { SuiteDelegationGuard } from './suite-delegation.guard';
import { DelegationDenied } from '../services/suite-delegation-verifier.service';
import { SUITE_DELEGATED_SCOPES } from '../domain/suite-delegation-scope';

/**
 * What a delegated caller learns from a refusal, and what a handler is handed
 * after one succeeds.
 */

const user = { id: 'user-1', name: 'Amina' };
const workspace = { id: 'ws-1', name: 'Acme' };

function context(headers: Record<string, string> = {}) {
  const request: any = {
    method: 'GET',
    url: '/api/delegation/whoami?x=1',
    routeOptions: { url: '/api/delegation/whoami' },
    headers: {
      authorization: 'Bearer client-token',
      'x-conqr-delegation': 'assertion',
      ...headers,
    },
    raw: {},
  };
  return {
    request,
    ctx: {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any,
  };
}

function build(verify: jest.Mock, scope?: string) {
  // `arguments.length`, not a default parameter: passing `undefined`
  // explicitly is exactly the case under test, and a default would silently
  // turn it back into the configured scope.
  const resolved = arguments.length > 1 ? scope : SUITE_DELEGATED_SCOPES.spaceRead;
  return new SuiteDelegationGuard(
    { getAllAndOverride: () => resolved } as any,
    { verify } as any,
  );
}

describe('SuiteDelegationGuard', () => {
  it('hands the handler the same shape a signed-in request produces', async () => {
    // So a delegated call runs through the *same* permission checks a session
    // does, rather than a parallel set that has to be kept in step.
    const delegation = { user, workspace, scope: ['space:read'] };
    const verify = jest.fn(async () => delegation);
    const { request, ctx } = context();

    await expect(build(verify).canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toEqual({ user, workspace });
    expect(request.raw.workspaceId).toBe(workspace.id);
    expect(request.raw.delegation).toBe(delegation);
  });

  it('passes the route pattern rather than the URL that was called', async () => {
    const verify = jest.fn(async () => ({ user, workspace, scope: [] }));
    const { ctx } = context();
    await build(verify).canActivate(ctx);
    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/delegation/whoami',
        clientToken: 'client-token',
        token: 'assertion',
        requiredScope: SUITE_DELEGATED_SCOPES.spaceRead,
      }),
    );
  });

  it('answers every refusal the same way except one', async () => {
    /**
     * Uniform 401, because the differences are what a caller would use to
     * probe which organisations, subjects and key ids exist here. An
     * insufficient scope is the exception: the caller *is* who it says it is,
     * and telling it the token cannot do this is the only way it can know to
     * ask for a different one.
     */
    for (const classification of [
      'client_unauthorized',
      'delegation_bad_signature',
      'org_unmapped',
      'identity_unmapped',
      'user_disabled',
      'delegation_not_configured',
    ]) {
      const verify = jest.fn(async () => {
        throw new DelegationDenied(classification);
      });
      const { ctx } = context();
      await expect(build(verify).canActivate(ctx)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }

    const verify = jest.fn(async () => {
      throw new DelegationDenied('delegation_insufficient_scope');
    });
    await expect(
      build(verify).canActivate(context().ctx),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a route that declares no scope', async () => {
    // Fail closed rather than open: the other choice makes a new endpoint
    // reachable by any valid assertion the moment it is written.
    const verify = jest.fn(async () => ({ user, workspace, scope: [] }));
    await expect(
      build(verify, undefined).canActivate(context().ctx),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verify).not.toHaveBeenCalled();
  });
});
