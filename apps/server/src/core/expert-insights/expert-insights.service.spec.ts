import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MongoAbility } from '@casl/ability';
import { ExpertInsightsService } from './expert-insights.service';
import { ExpertInsightsRepo, InsightRow } from './expert-insights.repo';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
  ISpaceAbility,
} from '../casl/interfaces/space-ability.type';
import { EventName } from '../../common/events/event.contants';
import { CreateInsightDto } from './dto/create-insight.dto';
import { InsightIdDto, UpdateInsightDto } from './dto/update-insight.dto';
import { QueryInsightsDto } from './dto/query-insights.dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WORKSPACE_ID = 'ws-1';
const SPACE_ID = 'sp-1';
const PAGE_ID = 'page-1';
const INSIGHT_ID = 'insight-1';
const USER_ID = 'user-1';

const mockUser = {
  id: USER_ID,
  workspaceId: WORKSPACE_ID,
} as any;

function makeInsight(overrides: Partial<InsightRow> = {}): InsightRow {
  return {
    id: INSIGHT_ID,
    workspaceId: WORKSPACE_ID,
    spaceId: SPACE_ID,
    pageId: PAGE_ID,
    insightType: 'warning',
    status: 'draft',
    title: 'Test insight',
    body: 'Some body text',
    createdBy: USER_ID,
    publishedBy: null,
    publishedAt: null,
    expiresAt: null,
    retiredAt: null,
    spanAnchor: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  };
}

/** Build a CASL ability stub that allows or denies a specific action/subject pair. */
function makeAbility(
  can: boolean,
  action: SpaceCaslAction,
  subject: SpaceCaslSubject,
): MongoAbility<ISpaceAbility> {
  return {
    can: (a: SpaceCaslAction, s: SpaceCaslSubject) => can && a === action && s === subject,
    cannot: (a: SpaceCaslAction, s: SpaceCaslSubject) => !can || a !== action || s !== subject,
  } as any;
}

/** Build a more flexible ability that allows multiple (action, subject) pairs. */
function makeMultiAbility(
  allowed: Array<[SpaceCaslAction, SpaceCaslSubject]>,
): MongoAbility<ISpaceAbility> {
  return {
    can: (a: SpaceCaslAction, s: SpaceCaslSubject) =>
      allowed.some(([aa, ss]) => aa === a && ss === s),
    cannot: (a: SpaceCaslAction, s: SpaceCaslSubject) =>
      !allowed.some(([aa, ss]) => aa === a && ss === s),
  } as any;
}

function makeRepo(overrides: Partial<jest.Mocked<ExpertInsightsRepo>> = {}): jest.Mocked<ExpertInsightsRepo> {
  return {
    create: jest.fn().mockResolvedValue(makeInsight()),
    findById: jest.fn().mockResolvedValue(makeInsight()),
    findByPage: jest.fn().mockResolvedValue([makeInsight()]),
    update: jest.fn().mockResolvedValue(makeInsight()),
    publish: jest.fn().mockResolvedValue(makeInsight({ status: 'published' })),
    retire: jest.fn().mockResolvedValue(makeInsight({ status: 'retired' })),
    softDelete: jest.fn().mockResolvedValue(undefined),
    retireExpired: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as any;
}

function makeSpaceAbility(ability: MongoAbility<ISpaceAbility>): jest.Mocked<SpaceAbilityFactory> {
  return {
    createForUser: jest.fn().mockResolvedValue(ability),
  } as any;
}

function makeEventEmitter(): jest.Mocked<EventEmitter2> {
  return {
    emit: jest.fn(),
  } as any;
}

function makeSvc(
  repo: jest.Mocked<ExpertInsightsRepo>,
  ability: MongoAbility<ISpaceAbility>,
  emitter?: jest.Mocked<EventEmitter2>,
): ExpertInsightsService {
  return new ExpertInsightsService(
    repo,
    makeSpaceAbility(ability),
    emitter ?? makeEventEmitter(),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExpertInsightsService', () => {
  // -----------------------------------------------------------------------
  // create()
  // -----------------------------------------------------------------------
  describe('create()', () => {
    const dto: CreateInsightDto = {
      pageId: PAGE_ID,
      spaceId: SPACE_ID,
      insightType: 'warning',
      title: 'My insight',
      body: 'Body text',
    };

    it('throws ForbiddenException when user cannot Manage Insight', async () => {
      const ability = makeAbility(false, SpaceCaslAction.Manage, SpaceCaslSubject.Insight);
      const svc = makeSvc(makeRepo(), ability);

      await expect(svc.create(dto, mockUser)).rejects.toThrow(ForbiddenException);
    });

    it('calls repo.create with correct input when user has Manage Insight', async () => {
      const ability = makeAbility(true, SpaceCaslAction.Manage, SpaceCaslSubject.Insight);
      const repo = makeRepo();
      const svc = makeSvc(repo, ability);

      await svc.create(dto, mockUser);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          spaceId: SPACE_ID,
          pageId: PAGE_ID,
          insightType: 'warning',
          title: 'My insight',
          body: 'Body text',
          createdBy: USER_ID,
        }),
      );
    });

    it('emits INSIGHT_CREATED event after successful creation', async () => {
      const ability = makeAbility(true, SpaceCaslAction.Manage, SpaceCaslSubject.Insight);
      const repo = makeRepo();
      const emitter = makeEventEmitter();
      const svc = makeSvc(repo, ability, emitter);

      await svc.create(dto, mockUser);

      expect(emitter.emit).toHaveBeenCalledWith(
        EventName.INSIGHT_CREATED,
        expect.objectContaining({ insightId: INSIGHT_ID }),
      );
    });

    it('converts expiresAt string to Date when provided', async () => {
      const ability = makeAbility(true, SpaceCaslAction.Manage, SpaceCaslSubject.Insight);
      const repo = makeRepo();
      const svc = makeSvc(repo, ability);
      const expiresAt = '2027-01-01T00:00:00.000Z';

      await svc.create({ ...dto, expiresAt }, mockUser);

      const call = repo.create.mock.calls[0][0];
      expect(call.expiresAt).toEqual(new Date(expiresAt));
    });
  });

  // -----------------------------------------------------------------------
  // findByPage()
  // -----------------------------------------------------------------------
  describe('findByPage()', () => {
    const dto: QueryInsightsDto = { pageId: PAGE_ID };

    it('returns [] when there are no insights for the page', async () => {
      const ability = makeMultiAbility([
        [SpaceCaslAction.Read, SpaceCaslSubject.Insight],
      ]);
      const repo = makeRepo({ findByPage: jest.fn().mockResolvedValue([]) });
      const svc = makeSvc(repo, ability);

      const result = await svc.findByPage(dto, mockUser);
      expect(result).toEqual([]);
    });

    it('throws ForbiddenException when user cannot Read Insight', async () => {
      const ability = makeAbility(false, SpaceCaslAction.Read, SpaceCaslSubject.Insight);
      const svc = makeSvc(makeRepo(), ability);

      await expect(svc.findByPage(dto, mockUser)).rejects.toThrow(ForbiddenException);
    });

    it('filters to published status for readers (no Manage permission)', async () => {
      const ability = makeMultiAbility([
        [SpaceCaslAction.Read, SpaceCaslSubject.Insight],
      ]);
      const repo = makeRepo({ findByPage: jest.fn().mockResolvedValue([makeInsight()]) });
      const svc = makeSvc(repo, ability);

      await svc.findByPage(dto, mockUser);

      const secondCall = repo.findByPage.mock.calls[1];
      expect(secondCall?.[1]).toBe('published');
    });

    it('does not filter status for managers (Manage Insight permission)', async () => {
      const ability = makeMultiAbility([
        [SpaceCaslAction.Read, SpaceCaslSubject.Insight],
        [SpaceCaslAction.Manage, SpaceCaslSubject.Insight],
      ]);
      const repo = makeRepo({ findByPage: jest.fn().mockResolvedValue([makeInsight()]) });
      const svc = makeSvc(repo, ability);

      await svc.findByPage(dto, mockUser);

      const secondCall = repo.findByPage.mock.calls[1];
      expect(secondCall?.[1]).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // update()
  // -----------------------------------------------------------------------
  describe('update()', () => {
    const dto: UpdateInsightDto = { insightId: INSIGHT_ID, title: 'Updated' };

    it('throws NotFoundException when insight does not exist', async () => {
      const ability = makeAbility(true, SpaceCaslAction.Manage, SpaceCaslSubject.Insight);
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(undefined) });
      const svc = makeSvc(repo, ability);

      await expect(svc.update(dto, mockUser)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user cannot Manage Insight', async () => {
      const ability = makeAbility(false, SpaceCaslAction.Manage, SpaceCaslSubject.Insight);
      const svc = makeSvc(makeRepo(), ability);

      await expect(svc.update(dto, mockUser)).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when insight is not in draft status', async () => {
      const ability = makeAbility(true, SpaceCaslAction.Manage, SpaceCaslSubject.Insight);
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue(makeInsight({ status: 'published' })),
      });
      const svc = makeSvc(repo, ability);

      await expect(svc.update(dto, mockUser)).rejects.toThrow(BadRequestException);
    });

    it('calls repo.update and emits INSIGHT_UPDATED on success', async () => {
      const ability = makeAbility(true, SpaceCaslAction.Manage, SpaceCaslSubject.Insight);
      const repo = makeRepo();
      const emitter = makeEventEmitter();
      const svc = makeSvc(repo, ability, emitter);

      await svc.update(dto, mockUser);

      expect(repo.update).toHaveBeenCalledWith(
        INSIGHT_ID,
        expect.objectContaining({ title: 'Updated' }),
      );
      expect(emitter.emit).toHaveBeenCalledWith(
        EventName.INSIGHT_UPDATED,
        expect.objectContaining({ insightId: INSIGHT_ID }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // publish()
  // -----------------------------------------------------------------------
  describe('publish()', () => {
    const dto: InsightIdDto = { insightId: INSIGHT_ID };

    it('throws NotFoundException when insight does not exist', async () => {
      const ability = makeAbility(true, SpaceCaslAction.Manage, SpaceCaslSubject.Insight);
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(undefined) });
      const svc = makeSvc(repo, ability);

      await expect(svc.publish(dto, mockUser)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when insight is already published', async () => {
      const ability = makeAbility(true, SpaceCaslAction.Manage, SpaceCaslSubject.Insight);
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue(makeInsight({ status: 'published' })),
      });
      const svc = makeSvc(repo, ability);

      await expect(svc.publish(dto, mockUser)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when insight is retired', async () => {
      const ability = makeAbility(true, SpaceCaslAction.Manage, SpaceCaslSubject.Insight);
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue(makeInsight({ status: 'retired' })),
      });
      const svc = makeSvc(repo, ability);

      await expect(svc.publish(dto, mockUser)).rejects.toThrow(BadRequestException);
    });

    it('calls repo.publish with userId and emits INSIGHT_PUBLISHED on success', async () => {
      const ability = makeAbility(true, SpaceCaslAction.Manage, SpaceCaslSubject.Insight);
      const repo = makeRepo();
      const emitter = makeEventEmitter();
      const svc = makeSvc(repo, ability, emitter);

      await svc.publish(dto, mockUser);

      expect(repo.publish).toHaveBeenCalledWith(INSIGHT_ID, USER_ID);
      expect(emitter.emit).toHaveBeenCalledWith(
        EventName.INSIGHT_PUBLISHED,
        expect.objectContaining({ insightId: INSIGHT_ID }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // retire()
  // -----------------------------------------------------------------------
  describe('retire()', () => {
    const dto: InsightIdDto = { insightId: INSIGHT_ID };

    it('throws BadRequestException when insight is in draft status', async () => {
      const ability = makeAbility(true, SpaceCaslAction.Manage, SpaceCaslSubject.Insight);
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue(makeInsight({ status: 'draft' })),
      });
      const svc = makeSvc(repo, ability);

      await expect(svc.retire(dto, mockUser)).rejects.toThrow(BadRequestException);
    });

    it('calls repo.retire and emits INSIGHT_RETIRED when retiring a published insight', async () => {
      const ability = makeAbility(true, SpaceCaslAction.Manage, SpaceCaslSubject.Insight);
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue(makeInsight({ status: 'published' })),
      });
      const emitter = makeEventEmitter();
      const svc = makeSvc(repo, ability, emitter);

      await svc.retire(dto, mockUser);

      expect(repo.retire).toHaveBeenCalledWith(INSIGHT_ID);
      expect(emitter.emit).toHaveBeenCalledWith(
        EventName.INSIGHT_RETIRED,
        expect.objectContaining({ insightId: INSIGHT_ID }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // delete()
  // -----------------------------------------------------------------------
  describe('delete()', () => {
    const dto: InsightIdDto = { insightId: INSIGHT_ID };

    it('throws NotFoundException when insight does not exist', async () => {
      const ability = makeAbility(true, SpaceCaslAction.Manage, SpaceCaslSubject.Insight);
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(undefined) });
      const svc = makeSvc(repo, ability);

      await expect(svc.delete(dto, mockUser)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user cannot Manage Insight', async () => {
      const ability = makeAbility(false, SpaceCaslAction.Manage, SpaceCaslSubject.Insight);
      const svc = makeSvc(makeRepo(), ability);

      await expect(svc.delete(dto, mockUser)).rejects.toThrow(ForbiddenException);
    });

    it('calls softDelete and emits INSIGHT_DELETED on success', async () => {
      const ability = makeAbility(true, SpaceCaslAction.Manage, SpaceCaslSubject.Insight);
      const repo = makeRepo();
      const emitter = makeEventEmitter();
      const svc = makeSvc(repo, ability, emitter);

      await svc.delete(dto, mockUser);

      expect(repo.softDelete).toHaveBeenCalledWith(INSIGHT_ID);
      expect(emitter.emit).toHaveBeenCalledWith(
        EventName.INSIGHT_DELETED,
        expect.objectContaining({ insightId: INSIGHT_ID }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // retireExpiredInsights()
  // -----------------------------------------------------------------------
  describe('retireExpiredInsights()', () => {
    it('delegates to repo.retireExpired and returns the retired IDs', async () => {
      const expiredIds = ['a', 'b', 'c'];
      const ability = makeAbility(true, SpaceCaslAction.Manage, SpaceCaslSubject.Insight);
      const repo = makeRepo({ retireExpired: jest.fn().mockResolvedValue(expiredIds) });
      const svc = makeSvc(repo, ability);

      const result = await svc.retireExpiredInsights();

      expect(result).toEqual(expiredIds);
      expect(repo.retireExpired).toHaveBeenCalledTimes(1);
    });

    it('returns an empty array when no insights are expired', async () => {
      const ability = makeAbility(true, SpaceCaslAction.Manage, SpaceCaslSubject.Insight);
      const repo = makeRepo({ retireExpired: jest.fn().mockResolvedValue([]) });
      const svc = makeSvc(repo, ability);

      const result = await svc.retireExpiredInsights();

      expect(result).toHaveLength(0);
    });
  });
});
