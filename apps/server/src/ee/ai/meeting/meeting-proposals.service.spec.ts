// PageService's prosemirror/happy-dom import chain does not survive the
// jest CJS transform (known repo-wide limitation); the service only needs
// the injected instance, so stub the module before importing.
jest.mock('../../../core/page/services/page.service', () => ({
  PageService: class {},
}));

// eslint-disable-next-line import/first
import { MeetingProposalsService } from './meeting-proposals.service';
// eslint-disable-next-line import/first
import { ProposalSeed } from './meeting-types/meeting-type.types';

const user = { id: 'user-1' } as never;
const meeting = { id: 'meeting-1', workspaceId: 'ws-1' } as never;

function seed(overrides: Partial<ProposalSeed> = {}): ProposalSeed {
  return {
    kind: 'create_work_item',
    targetApp: 'conqrplane',
    title: 'Fix login bug',
    payload: { name: 'Fix login bug', projectId: 'proj-1' },
    reason: 'Committed in the meeting',
    evidence: [{ segmentIds: ['s0001'], quote: 'I will fix the login bug' }],
    confidence: 0.9,
    commitment: 'explicit',
    riskLevel: 'normal',
    ...overrides,
  };
}

function buildService(overrides: {
  repo?: Partial<Record<string, jest.Mock>>;
  planeClient?: Partial<Record<string, jest.Mock>>;
} = {}) {
  const repo = {
    insertProposal: jest.fn(async (row: Record<string, unknown>) => ({
      id: 'prop-1',
      status: 'proposed',
      ...row,
    })),
    findProposal: jest.fn(),
    transitionProposal: jest.fn(),
    listProposals: jest.fn(async () => []),
    ...overrides.repo,
  };
  const planeClient = {
    isEnabled: jest.fn(() => true),
    listWorkItems: jest.fn(async () => ({ results: [] })),
    createWorkItem: jest.fn(async () => ({ id: 'wi-99' })),
    ...overrides.planeClient,
  };
  const pageService = { create: jest.fn(async () => ({ id: 'page-9' })) };
  const spaceAbility = {
    createForUser: jest.fn(async () => ({ cannot: () => false })),
  };
  const service = new MeetingProposalsService(
    repo as never,
    planeClient as never,
    pageService as never,
    spaceAbility as never,
  );
  return { service, repo, planeClient, pageService };
}

describe('MeetingProposalsService', () => {
  describe('createFromSeeds', () => {
    it('persists proposals with duplicate-check results and idempotency keys', async () => {
      const { service, repo, planeClient } = buildService({
        planeClient: {
          listWorkItems: jest.fn(async () => ({
            results: [{ id: 'wi-1', name: 'Fix login bug' }],
          })),
        },
      });
      const created = await service.createFromSeeds({
        meeting,
        workspaceId: 'ws-1',
        transcriptVersion: 1,
        documentId: 'doc-1',
        seeds: [seed()],
      });
      expect(created).toHaveLength(1);
      const row = repo.insertProposal.mock.calls[0][0] as {
        idempotencyKey: string;
        duplicateCheck: { searched: boolean; candidates: { id: string }[] };
      };
      expect(row.idempotencyKey).toHaveLength(64);
      expect(row.duplicateCheck.searched).toBe(true);
      expect(row.duplicateCheck.candidates[0].id).toBe('wi-1');
      expect(planeClient.listWorkItems).toHaveBeenCalledWith('proj-1', {
        search: 'Fix login bug',
        perPage: 5,
      });
    });

    it('is idempotent: conflicting idempotency keys are dropped silently', async () => {
      const { service } = buildService({
        repo: { insertProposal: jest.fn(async () => undefined) },
      });
      const created = await service.createFromSeeds({
        meeting,
        workspaceId: 'ws-1',
        transcriptVersion: 1,
        documentId: null,
        seeds: [seed()],
      });
      expect(created).toHaveLength(0);
    });

    it('flags missing required fields and unconnected targets', async () => {
      const { service, repo } = buildService();
      await service.createFromSeeds({
        meeting,
        workspaceId: 'ws-1',
        transcriptVersion: 1,
        documentId: null,
        seeds: [
          seed({ payload: { name: 'No project chosen' } }),
          seed({
            kind: 'toptalent_save_interview',
            targetApp: 'conqrtoptalent',
            title: 'Save interview',
            payload: {},
          }),
        ],
      });
      type Row = { validation: { missingFields: string[]; warnings: string[] } };
      const first = repo.insertProposal.mock.calls[0][0] as Row;
      expect(first.validation.missingFields).toContain('projectId');
      const second = repo.insertProposal.mock.calls[1][0] as Row;
      expect(second.validation.warnings.join(' ')).toContain('not connected');
    });
  });

  describe('approve', () => {
    it('requires explicit confirmation for risky proposals (D10)', async () => {
      const { service } = buildService({
        repo: {
          findProposal: jest.fn(async () => ({
            id: 'prop-1',
            status: 'proposed',
            targetApp: 'conqrplane',
            riskLevel: 'risky',
            payload: {},
            validation: { missingFields: [] },
          })),
        },
      });
      await expect(
        service.approve({ proposalId: 'prop-1', workspaceId: 'ws-1', user }),
      ).rejects.toThrow('risky action');
    });

    it('refuses approval for unconnected target apps (seams)', async () => {
      const { service } = buildService({
        repo: {
          findProposal: jest.fn(async () => ({
            id: 'prop-1',
            status: 'proposed',
            targetApp: 'conqrcrm',
            riskLevel: 'normal',
            payload: {},
            validation: { missingFields: [] },
          })),
        },
      });
      await expect(
        service.approve({ proposalId: 'prop-1', workspaceId: 'ws-1', user }),
      ).rejects.toThrow('not connected');
    });

    it('refuses approval while required fields are missing', async () => {
      const { service } = buildService({
        repo: {
          findProposal: jest.fn(async () => ({
            id: 'prop-1',
            status: 'proposed',
            targetApp: 'conqrplane',
            riskLevel: 'normal',
            payload: { name: 'x' },
            validation: { missingFields: ['projectId'] },
          })),
        },
      });
      await expect(
        service.approve({ proposalId: 'prop-1', workspaceId: 'ws-1', user }),
      ).rejects.toThrow('projectId');
    });

    it('accepts edit-and-approve supplying the missing fields', async () => {
      const transitionProposal = jest.fn(async () => ({
        id: 'prop-1',
        status: 'approved',
      }));
      const { service } = buildService({
        repo: {
          findProposal: jest.fn(async () => ({
            id: 'prop-1',
            status: 'proposed',
            targetApp: 'conqrplane',
            riskLevel: 'normal',
            payload: { name: 'x' },
            validation: { missingFields: ['projectId'] },
            editedPayload: null,
          })),
          transitionProposal,
        },
      });
      const approved = await service.approve({
        proposalId: 'prop-1',
        workspaceId: 'ws-1',
        user,
        editedPayload: { projectId: 'proj-7' },
      });
      expect(approved.status).toBe('approved');
      expect(transitionProposal).toHaveBeenCalledWith(
        'prop-1',
        'ws-1',
        ['proposed', 'draft', 'failed'],
        'approved',
        expect.objectContaining({ decidedBy: 'user-1' }),
      );
    });
  });

  describe('approveSafe', () => {
    it('bulk-approves only safe complete proposals, skipping risky ones', async () => {
      const proposals = [
        {
          id: 'p-safe',
          status: 'proposed',
          riskLevel: 'safe',
          targetApp: 'conqrplane',
          payload: { projectId: 'proj-1' },
          validation: { missingFields: [] },
        },
        {
          id: 'p-risky',
          status: 'proposed',
          riskLevel: 'risky',
          targetApp: 'conqrplane',
          payload: {},
          validation: { missingFields: [] },
        },
        { id: 'p-done', status: 'executed', riskLevel: 'safe' },
      ];
      const { service } = buildService({
        repo: {
          listProposals: jest.fn(async () => proposals),
          findProposal: jest.fn(async (id: string) =>
            proposals.find((p) => p.id === id),
          ),
          transitionProposal: jest.fn(async (id: string) => ({
            id,
            status: 'approved',
          })),
        },
      });
      const result = await service.approveSafe('meeting-1', 'ws-1', user);
      expect(result.approved).toEqual(['p-safe']);
      expect(result.skipped).toEqual([
        { id: 'p-risky', reason: 'risk level is risky' },
      ]);
    });
  });

  describe('execute', () => {
    it('creates a real Plane work item and records the real result', async () => {
      const transitions: unknown[][] = [];
      const { service, planeClient } = buildService({
        repo: {
          transitionProposal: jest.fn(async (...args: unknown[]) => {
            transitions.push(args);
            if (args[3] === 'executing') {
              return {
                id: 'prop-1',
                meetingId: 'meeting-1',
                workspaceId: 'ws-1',
                kind: 'create_work_item',
                targetApp: 'conqrplane',
                title: 'Fix login bug',
                payload: { name: 'Fix login bug', projectId: 'proj-1', priority: 'high' },
                editedPayload: null,
                evidence: [],
              };
            }
            return { id: 'prop-1', status: args[3] };
          }),
        },
      });
      const result = await service.execute({
        proposalId: 'prop-1',
        workspaceId: 'ws-1',
        actorId: 'user-1',
      });
      expect(planeClient.createWorkItem).toHaveBeenCalledWith(
        'proj-1',
        expect.objectContaining({ name: 'Fix login bug', priority: 'high' }),
      );
      expect(result.status).toBe('executed');
      const executedCall = transitions.find((t) => t[3] === 'executed');
      expect(
        (executedCall?.[4] as { executionResult: { entityId: string } })
          .executionResult.entityId,
      ).toBe('wi-99');
    });

    it('records real failures as failed with the error (never fake success)', async () => {
      const transitions: unknown[][] = [];
      const { service } = buildService({
        planeClient: {
          isEnabled: jest.fn(() => true),
          createWorkItem: jest.fn(async () => {
            throw new Error('Plane API 502');
          }),
        },
        repo: {
          transitionProposal: jest.fn(async (...args: unknown[]) => {
            transitions.push(args);
            if (args[3] === 'executing') {
              return {
                id: 'prop-1',
                meetingId: 'meeting-1',
                workspaceId: 'ws-1',
                kind: 'create_work_item',
                targetApp: 'conqrplane',
                title: 'Fix login bug',
                payload: { name: 'x', projectId: 'proj-1' },
                editedPayload: null,
                evidence: [],
              };
            }
            return { id: 'prop-1', status: args[3] };
          }),
        },
      });
      const result = await service.execute({
        proposalId: 'prop-1',
        workspaceId: 'ws-1',
        actorId: 'user-1',
      });
      expect(result.status).toBe('failed');
      const failedCall = transitions.find((t) => t[3] === 'failed');
      expect(
        (failedCall?.[4] as { executionResult: { error: string } })
          .executionResult.error,
      ).toContain('Plane API 502');
    });

    it('is idempotent: duplicate execution jobs no-op when not approved', async () => {
      const { service, planeClient } = buildService({
        repo: {
          transitionProposal: jest.fn(async () => undefined),
          findProposal: jest.fn(async () => ({
            id: 'prop-1',
            status: 'executed',
          })),
        },
      });
      const result = await service.execute({
        proposalId: 'prop-1',
        workspaceId: 'ws-1',
        actorId: 'user-1',
      });
      expect(result.status).toBe('executed');
      expect(planeClient.createWorkItem).not.toHaveBeenCalled();
    });
  });
});
