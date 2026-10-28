import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { MeetingController } from './meeting.controller';
import { MeetingAccessGuard } from './meeting-access.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';

jest.mock('./meeting.service', () => ({ MeetingService: class {} }));

/**
 * LTC Strict Private, phase 0: route inventory. MeetingAccessGuard only
 * checks routes that carry a meeting id in the path (`:id`). Every route of
 * the controller must therefore be either a `:id` route, the list, or a
 * creation (start, upload) — a new route that takes a meeting some other way
 * (body, query) would escape the guard, so this test fails until it is
 * classified here and checked. The 36 routes deployed on LTC on 28 Oct 2026
 * are listed one by one.
 */
const EXPECTED: Record<string, 'read' | 'write' | 'list' | 'create'> = {
  'POST start': 'create',
  'POST upload': 'create',
  'GET ': 'list',
  'POST :id/chunk': 'write',
  'GET :id/capture': 'read',
  'POST :id/stop': 'write',
  'GET :id': 'read',
  'PATCH :id': 'write',
  'POST :id/archive': 'write',
  'POST :id/unarchive': 'write',
  'POST :id/markers': 'write',
  'DELETE :id': 'write',
  'POST :id/ai-output': 'write',
  'GET :id/insights': 'read',
  'POST :id/insights': 'write',
  'DELETE :id/insights/:insightId': 'write',
  'POST :id/process': 'write',
  'POST :id/retry': 'write',
  'GET :id/status': 'read',
  'GET :id/transcript': 'read',
  'POST :id/transcript/speakers': 'write',
  'GET :id/linkable-members': 'read',
  'POST :id/transcript/remove-echoes': 'write',
  'POST :id/transcript/attribute': 'write',
  'GET :id/documents': 'read',
  'POST :id/documents/:docId/publish': 'write',
  'POST :id/publish-bundle': 'write',
  'POST :id/evaluation/generate': 'write',
  'POST :id/evaluation': 'write',
  'GET :id/proposals': 'read',
  'POST :id/proposals/:pid/approve': 'write',
  'POST :id/proposals/:pid/reject': 'write',
  'POST :id/review': 'write',
  'POST :id/proposals/approve-safe': 'write',
  'GET :id/audio': 'read',
  'GET :id/audio/file': 'read',
};

function routes(): string[] {
  const proto = MeetingController.prototype as any;
  return Object.getOwnPropertyNames(proto)
    .filter((name) => name !== 'constructor')
    .map((name) => proto[name])
    .filter((fn) => typeof fn === 'function' && Reflect.hasMetadata(PATH_METADATA, fn))
    .map((fn) => {
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, fn)];
      const raw = String(Reflect.getMetadata(PATH_METADATA, fn));
      const path = raw === '/' ? '' : raw.replace(/^\//, '');
      return `${method} ${path}`;
    });
}

describe('meeting routes: none escapes MeetingAccessGuard', () => {
  it('has exactly the 36 known routes', () => {
    expect(routes().sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(Object.keys(EXPECTED)).toHaveLength(36);
  });

  it('puts every route but the list and the two creations behind a meeting id in the path', () => {
    for (const route of routes()) {
      const kind = EXPECTED[route];
      const path = route.split(' ')[1];
      if (kind === 'read' || kind === 'write') {
        expect([route, path === ':id' || path.startsWith(':id/')]).toEqual([route, true]);
      } else {
        expect([route, path.includes(':id')]).toEqual([route, false]);
      }
    }
  });

  it('guards the whole controller with JwtAuthGuard then MeetingAccessGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, MeetingController) as unknown[];
    expect(guards).toContain(JwtAuthGuard);
    expect(guards).toContain(MeetingAccessGuard);
    expect(guards.indexOf(JwtAuthGuard)).toBeLessThan(guards.indexOf(MeetingAccessGuard));
    // No method-level guard list that would replace the controller's.
    const proto = MeetingController.prototype as any;
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue;
      expect([name, Reflect.getMetadata(GUARDS_METADATA, proto[name])]).toEqual([name, undefined]);
    }
  });
});
