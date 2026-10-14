import {
  canEditMeeting,
  canReadMeeting,
  isWorkspaceManager,
  meetingSpaceIds,
} from './meeting-access.util';

// The company rule: every member reads; the creator, Owners and Admins edit.
describe('canReadMeeting', () => {
  const meeting = { userId: 'annie', workspaceId: 'w1', spaceId: null, settings: { publishedBundle: { spaceId: 'lumen' } } };

  it('lets every member of the company read, whatever their spaces', () => {
    expect(canReadMeeting(meeting, { id: 'annie', role: 'member', workspaceId: 'w1' })).toBe(true);
    expect(canReadMeeting(meeting, { id: 'marc', role: 'member', workspaceId: 'w1' })).toBe(true);
    expect(canReadMeeting(meeting, { id: 'karim', role: 'member', workspaceId: 'w1' })).toBe(true);
    expect(canReadMeeting(meeting, { id: 'sophie', role: 'admin', workspaceId: 'w1' })).toBe(true);
  });

  it('never crosses companies, even for an owner', () => {
    expect(canReadMeeting(meeting, { id: 'annie', role: 'owner', workspaceId: 'w2' })).toBe(false);
    expect(canReadMeeting(meeting, { id: '', role: 'owner', workspaceId: 'w1' })).toBe(false);
  });
});

describe('canEditMeeting', () => {
  const meeting = { userId: 'annie', workspaceId: 'w1' };

  it('lets the creator, Owners and Admins edit', () => {
    expect(canEditMeeting(meeting, { id: 'annie', role: 'member', workspaceId: 'w1' })).toBe(true);
    expect(canEditMeeting(meeting, { id: 'sophie', role: 'admin', workspaceId: 'w1' })).toBe(true);
    expect(canEditMeeting(meeting, { id: 'olivier', role: 'owner', workspaceId: 'w1' })).toBe(true);
  });

  it('refuses other members and other companies', () => {
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
