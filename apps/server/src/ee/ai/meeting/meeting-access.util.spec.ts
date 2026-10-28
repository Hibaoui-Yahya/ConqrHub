import {
  canEditMeeting,
  canReadMeeting,
  isWorkspaceManager,
  meetingSpaceIds,
} from './meeting-access.util';

// LTC Strict Private, phase 0: the creator alone reads and edits; no role
// and no space gives access.
describe('canReadMeeting', () => {
  const meeting = { userId: 'annie', workspaceId: 'w1', spaceId: null, settings: { publishedBundle: { spaceId: 'lumen' } } };

  it('lets the creator read', () => {
    expect(canReadMeeting(meeting, { id: 'annie', role: 'member', workspaceId: 'w1' })).toBe(true);
  });

  it('refuses colleagues, Admins and Owners of the company, and members of its spaces', () => {
    expect(canReadMeeting(meeting, { id: 'karim', role: 'member', workspaceId: 'w1' })).toBe(false);
    expect(canReadMeeting(meeting, { id: 'sophie', role: 'admin', workspaceId: 'w1' })).toBe(false);
    expect(canReadMeeting(meeting, { id: 'olivier', role: 'owner', workspaceId: 'w1' })).toBe(false);
  });

  it('never crosses companies, even for the same id, and refuses an empty actor or meeting', () => {
    expect(canReadMeeting(meeting, { id: 'annie', role: 'owner', workspaceId: 'w2' })).toBe(false);
    expect(canReadMeeting(meeting, { id: '', role: 'owner', workspaceId: 'w1' })).toBe(false);
    expect(canReadMeeting({ userId: '', workspaceId: 'w1' }, { id: '', role: 'member', workspaceId: 'w1' })).toBe(false);
    expect(canReadMeeting(meeting, { id: 'annie', role: 'member', workspaceId: '' })).toBe(false);
  });
});

describe('canEditMeeting', () => {
  const meeting = { userId: 'annie', workspaceId: 'w1' };

  it('lets the creator edit', () => {
    expect(canEditMeeting(meeting, { id: 'annie', role: 'member', workspaceId: 'w1' })).toBe(true);
  });

  it('refuses Owners, Admins, other members and other companies', () => {
    expect(canEditMeeting(meeting, { id: 'sophie', role: 'admin', workspaceId: 'w1' })).toBe(false);
    expect(canEditMeeting(meeting, { id: 'olivier', role: 'owner', workspaceId: 'w1' })).toBe(false);
    expect(canEditMeeting(meeting, { id: 'karim', role: 'member', workspaceId: 'w1' })).toBe(false);
    expect(canEditMeeting(meeting, { id: 'annie', role: 'member', workspaceId: 'w2' })).toBe(false);
    expect(canEditMeeting(meeting, { id: 'sophie', role: 'admin', workspaceId: 'w2' })).toBe(false);
  });
});

describe('isWorkspaceManager', () => {
  it('accepts an actor or a bare role', () => {
    expect(isWorkspaceManager({ role: 'admin' })).toBe(true);
    expect(isWorkspaceManager('owner')).toBe(true);
    expect(isWorkspaceManager('member')).toBe(false);
    expect(isWorkspaceManager(null)).toBe(false);
  });
});

describe('meetingSpaceIds', () => {
  it('lists its space and the space it was published into', () => {
    expect(meetingSpaceIds({ spaceId: 'a', settings: JSON.stringify({ publishedBundle: { spaceId: 'b' } }) })).toEqual(['a', 'b']);
    expect(meetingSpaceIds({ spaceId: null, settings: 'not json' })).toEqual([]);
  });
});
