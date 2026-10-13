import { canReadMeeting, meetingSpaceIds } from './meeting-access.util';

describe('canReadMeeting', () => {
  const meeting = { userId: 'annie', workspaceId: 'w1', spaceId: null, settings: { publishedBundle: { spaceId: 'lumen' } } };

  it('lets the author read', () => {
    expect(canReadMeeting(meeting, { id: 'annie', role: 'member', workspaceId: 'w1' }, [])).toBe(true);
  });
  it('lets members of the published space read', () => {
    expect(canReadMeeting(meeting, { id: 'marc', role: 'member', workspaceId: 'w1' }, ['lumen'])).toBe(true);
  });
  it('lets members of the meeting space read', () => {
    expect(canReadMeeting({ ...meeting, settings: null, spaceId: 'horizon' }, { id: 'marc', role: 'member', workspaceId: 'w1' }, ['horizon'])).toBe(true);
  });
  it('refuses another recruiter outside the space', () => {
    expect(canReadMeeting(meeting, { id: 'karim', role: 'member', workspaceId: 'w1' }, ['rh-interne'])).toBe(false);
    expect(canReadMeeting({ ...meeting, settings: null }, { id: 'karim', role: 'member', workspaceId: 'w1' }, ['lumen'])).toBe(false);
  });
  it('lets workspace owners and admins read, never across workspaces', () => {
    expect(canReadMeeting(meeting, { id: 'sophie', role: 'admin', workspaceId: 'w1' }, [])).toBe(true);
    expect(canReadMeeting(meeting, { id: 'sophie', role: 'owner', workspaceId: 'w1' }, [])).toBe(true);
    expect(canReadMeeting(meeting, { id: 'annie', role: 'owner', workspaceId: 'w2' }, ['lumen'])).toBe(false);
  });
  it('reads the published space from string settings too', () => {
    expect(meetingSpaceIds({ spaceId: 'a', settings: JSON.stringify({ publishedBundle: { spaceId: 'b' } }) })).toEqual(['a', 'b']);
    expect(meetingSpaceIds({ spaceId: null, settings: 'not json' })).toEqual([]);
  });
});
