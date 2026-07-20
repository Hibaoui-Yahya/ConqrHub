import { createHash } from 'node:crypto';

// The documents/proposals services transitively import PageService, whose
// prosemirror/happy-dom chain does not survive the jest CJS transform (a
// known repo-wide limitation). The pipeline only needs them as constructor
// slots here, so stub the modules before importing the service under test.
jest.mock('./meeting-documents.service', () => ({
  MeetingDocumentsService: class {},
}));
jest.mock('./meeting-proposals.service', () => ({
  MeetingProposalsService: class {},
}));

// eslint-disable-next-line import/first
import { MeetingPipelineService } from './meeting-pipeline.service';
// eslint-disable-next-line import/first
import { extractJson } from './meeting-analysis.service';

const TOKEN = 'a'.repeat(64);
const tokenHash = createHash('sha256').update(TOKEN).digest('hex');

function buildService(overrides: {
  transcript?: Record<string, unknown> | undefined;
} = {}) {
  const transcript =
    'transcript' in overrides
      ? overrides.transcript
      : {
          id: 't-1',
          meetingId: 'meet-1',
          version: 1,
          status: 'processing',
          providerJobId: 'job-1',
          webhookTokenHash: tokenHash,
          createdAt: new Date(),
        };
  const intelRepo = {
    findTranscriptByProviderJobId: jest.fn(async () => transcript),
    insertEvent: jest.fn(async () => ({})),
    updateTranscript: jest.fn(async () => ({})),
    transitionStatus: jest.fn(async () => ({ id: 'meet-1' })),
  };
  const meetingRepo = {
    findByIdUnscoped: jest.fn(async () => ({
      id: 'meet-1',
      workspaceId: 'ws-1',
      status: 'batch_processing',
    })),
  };
  const queue = { add: jest.fn(async () => ({})) };
  const service = new MeetingPipelineService(
    meetingRepo as never,
    intelRepo as never,
    {} as never, // storage
    {} as never, // analysis
    {} as never, // documents
    {} as never, // proposals
    {} as never, // environment
    { name: 'speechmatics-batch' } as never, // provider
    queue as never,
  );
  return { service, intelRepo, meetingRepo, queue };
}

describe('MeetingPipelineService.handleProviderCallback (webhook security + idempotency)', () => {
  it('rejects unknown provider job ids with 404 (no information leak)', async () => {
    const { service } = buildService({ transcript: undefined });
    await expect(
      service.handleProviderCallback({
        providerJobId: 'nope',
        status: 'success',
        bearerToken: TOKEN,
      }),
    ).rejects.toThrow('Not Found');
  });

  it('rejects missing bearer tokens', async () => {
    const { service, queue } = buildService();
    await expect(
      service.handleProviderCallback({
        providerJobId: 'job-1',
        status: 'success',
        bearerToken: null,
      }),
    ).rejects.toThrow('Not Found');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('rejects wrong tokens with 404 (constant-time compare)', async () => {
    const { service, queue } = buildService();
    await expect(
      service.handleProviderCallback({
        providerJobId: 'job-1',
        status: 'success',
        bearerToken: 'b'.repeat(64),
      }),
    ).rejects.toThrow('Not Found');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('accepts a valid success callback and queues transcript processing', async () => {
    const { service, queue, intelRepo } = buildService();
    const result = await service.handleProviderCallback({
      providerJobId: 'job-1',
      status: 'success',
      bearerToken: TOKEN,
    });
    expect(result).toBe('accepted');
    expect(queue.add).toHaveBeenCalledWith(
      'meeting-process-transcript',
      expect.objectContaining({ providerJobId: 'job-1', meetingId: 'meet-1' }),
      expect.objectContaining({
        // No ':' allowed — BullMQ rejects custom ids containing its separator.
        jobId: 'meeting-process-transcript--meet-1-job-1',
      }),
    );
    expect(intelRepo.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'webhook_received' }),
    );
  });

  it('no-ops on duplicate webhooks once the transcript is settled', async () => {
    const { service, queue } = buildService({
      transcript: {
        id: 't-1',
        meetingId: 'meet-1',
        status: 'ready',
        providerJobId: 'job-1',
        webhookTokenHash: tokenHash,
      },
    });
    const result = await service.handleProviderCallback({
      providerJobId: 'job-1',
      status: 'success',
      bearerToken: TOKEN,
    });
    expect(result).toBe('noop');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('marks the transcript failed on error callbacks', async () => {
    const { service, intelRepo } = buildService();
    await service.handleProviderCallback({
      providerJobId: 'job-1',
      status: 'fetch_error',
      bearerToken: TOKEN,
    });
    expect(intelRepo.updateTranscript).toHaveBeenCalledWith(
      't-1',
      expect.objectContaining({ status: 'failed' }),
    );
  });
});

describe('extractJson (LLM output tolerance)', () => {
  it('parses plain JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it('strips code fences', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('recovers embedded objects from prose', () => {
    expect(extractJson('Here you go: {"a":1} hope that helps')).toEqual({ a: 1 });
  });
  it('returns null on garbage instead of throwing', () => {
    expect(extractJson('no json here')).toBeNull();
  });
});
