import { MeetingService } from './meeting.service';
import { StorageObjectNotFoundError } from '../../../integrations/storage/storage.errors';

jest.mock('../../../core/page/services/page.service', () => ({ PageService: class {} }));
jest.mock('../stt/stt.service', () => ({ SttService: class {} }));
jest.mock('../providers/ai-provider.service', () => ({ AiProviderService: class {} }));

describe('meeting audio links during storage cutover', () => {
  const actor = { id: 'user-id', role: 'member', workspaceId: 'workspace-id' };

  function setup() {
    const storage = {
      getDriverName: jest.fn(() => 's3'),
      getSignedUrl: jest.fn(async () => 'https://private.example/synthetic-signed-audio'),
    };
    const fake = {
      storage,
      resolveAudioFile: jest.fn(async () => ({ filePath: 'workspace/audio/test.wav', mime: 'audio/wav' })),
    };
    const get = (target?: string) => MeetingService.prototype.getAudioUrl.call(fake as any, actor, 'meeting-id', target);
    return { storage, fake, get };
  }

  it('streams a local-only cutover file through the authenticated Meet bridge', async () => {
    const { storage, get } = setup();
    storage.getSignedUrl.mockRejectedValueOnce(new StorageObjectNotFoundError('Local-only object'));
    expect(await get('system')).toEqual({
      url: '/hubapi/ai/meeting/meeting-id/audio/file?target=system',
      expiresIn: 120,
    });
  });

  it('resolves the file for the caller, who must be able to read the meeting', async () => {
    const { fake, get } = setup();
    await get();
    expect(fake.resolveAudioFile).toHaveBeenCalledWith(
      { id: 'user-id', role: 'member', workspaceId: 'workspace-id' },
      'meeting-id',
      'original',
    );
  });

  it('keeps existing signed S3 playback compatible', async () => {
    const { get } = setup();
    expect(await get()).toEqual({ url: 'https://private.example/synthetic-signed-audio', expiresIn: 120 });
  });

  it('signs the recording for 120 s only: a signed URL works for whoever holds it', async () => {
    const { storage, get } = setup();
    await get();
    expect(storage.getSignedUrl).toHaveBeenCalledTimes(1);
    expect((storage.getSignedUrl.mock.calls[0] as unknown[])[1]).toBe(120);
  });

  it('does not hide storage authorization or provider failures', async () => {
    const { storage, get } = setup();
    const failure = new Error('Synthetic provider authorization failure');
    storage.getSignedUrl.mockRejectedValueOnce(failure);
    await expect(get()).rejects.toBe(failure);
  });
});
