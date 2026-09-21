import 'reflect-metadata';
import { PATH_METADATA } from '@nestjs/common/constants';
import { SuiteDelegationController } from './suite-delegation.controller';
import {
  DELEGATION_SCOPE_KEY,
  SuiteDelegationGuard,
} from './suite-delegation.guard';
import { ALL_SUITE_DELEGATED_SCOPES } from '../domain/suite-delegation-scope';
import { NO_WORKSPACE_REQUIRED_URL_PREFIXES } from '../../../common/middlewares/domain-exempt-routes';

/**
 * Two things about the delegated surface that no unit test of the verifier can
 * see, and that both fail silently in a way that is expensive to diagnose.
 *
 * A route that is not domain-exempt gets 404 "Workspace not found" before the
 * guard ever runs — the exact failure that made every ConqrPlan webhook
 * delivery disappear for the life of that integration. A route with no scope
 * declared is refused by the guard, so it is dead rather than dangerous, but
 * it is dead in a way that reads as a broken assertion.
 *
 * Both are derived from the controller here, so adding a route without
 * finishing the job breaks the build instead of the deployment.
 */

function routes(): { method: string; path: string }[] {
  const base = Reflect.getMetadata(PATH_METADATA, SuiteDelegationController);
  const proto = SuiteDelegationController.prototype;
  return Object.getOwnPropertyNames(proto)
    .filter((name) => name !== 'constructor')
    .map((name) => ({
      method: name,
      path: `/api/${base}/${Reflect.getMetadata(PATH_METADATA, proto[name])}`,
    }));
}

describe('the delegated surface', () => {
  it('has at least one route, or this file is proving nothing', () => {
    expect(routes().length).toBeGreaterThan(0);
  });

  it('exempts every delegated route from the host-based workspace lookup', () => {
    for (const route of routes()) {
      expect(
        NO_WORKSPACE_REQUIRED_URL_PREFIXES.some((prefix) =>
          route.path.startsWith(prefix),
        ),
      ).toBe(true);
    }
  });

  it('declares a known scope on every delegated route', () => {
    const proto = SuiteDelegationController.prototype as any;
    for (const route of routes()) {
      const scope = Reflect.getMetadata(
        DELEGATION_SCOPE_KEY,
        proto[route.method],
      );
      expect(ALL_SUITE_DELEGATED_SCOPES).toContain(scope);
    }
  });

  it('pins each business route to its exact least-privilege scope', () => {
    const expected = {
      listSpaces: 'space:read',
      readSpace: 'space:read',
      createSpace: 'space:create',
      updateSpace: 'space:update',
      searchPages: 'page:search',
      listPages: 'page:read',
      recentPages: 'page:read',
      readPage: 'page:read',
      breadcrumbs: 'page:read',
      history: 'page:read',
      createPage: 'page:create',
      updatePage: 'page:update',
      listComments: 'comment:read',
      createComment: 'comment:create',
      updateComment: 'comment:update',
    } as const;
    const proto = SuiteDelegationController.prototype as any;
    for (const [method, scope] of Object.entries(expected)) {
      expect(Reflect.getMetadata(DELEGATION_SCOPE_KEY, proto[method])).toBe(
        scope,
      );
    }
  });

  it('guards every delegated route', () => {
    const proto = SuiteDelegationController.prototype as any;
    for (const route of routes()) {
      const guards =
        Reflect.getMetadata('__guards__', proto[route.method]) ?? [];
      expect(guards).toContain(SuiteDelegationGuard);
    }
  });
});
