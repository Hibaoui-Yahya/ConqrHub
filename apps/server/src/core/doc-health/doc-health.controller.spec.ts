import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DocHealthController } from './doc-health.controller';
import { HealthIssueCategory } from './dto/doc-health.dto';

const mockUser = { id: 'user-1', role: 'member' } as any;
const mockAdminUser = { id: 'admin-1', role: 'admin' } as any;
const mockWorkspace = { id: 'workspace-1' } as any;
const mockSpace = {
  id: 'space-1',
  workspaceId: 'workspace-1',
  slug: 's1',
} as any;

const adminAbility = { can: () => true, cannot: () => false } as any;
const memberAbility = { can: () => false, cannot: () => true } as any;

function buildController() {
  const docHealth: any = {
    getWorkspaceHealth: jest.fn().mockResolvedValue({ score: 90 }),
    getSpaceHealth: jest.fn().mockResolvedValue({ score: 85 }),
  };
  const issues: any = {
    listIssues: jest.fn().mockResolvedValue({ items: [], hasMore: false }),
  };
  const snapshots: any = {
    getTrend: jest
      .fn()
      .mockResolvedValue([
        { capturedAt: '2026-04-25T00:00:00.000Z', score: 80 },
        { capturedAt: '2026-04-26T00:00:00.000Z', score: 82 },
      ]),
    captureWorkspace: jest.fn().mockResolvedValue(undefined),
  };
  const workspaceAbility: any = { createForUser: jest.fn() };
  const spaceAbility: any = { createForUser: jest.fn() };
  const spaceRepo: any = { findById: jest.fn() };

  const controller = new DocHealthController(
    docHealth,
    issues,
    snapshots,
    workspaceAbility,
    spaceAbility,
    spaceRepo,
  );

  return {
    controller,
    docHealth,
    issues,
    snapshots,
    workspaceAbility,
    spaceAbility,
    spaceRepo,
  };
}

describe('DocHealthController', () => {
  describe('getWorkspaceHealth', () => {
    it('returns score for a workspace admin', async () => {
      const { controller, workspaceAbility, docHealth } = buildController();
      workspaceAbility.createForUser.mockReturnValue(adminAbility);

      const result = await controller.getWorkspaceHealth(
        mockAdminUser,
        mockWorkspace,
      );

      expect(result).toEqual({ score: 90 });
      expect(docHealth.getWorkspaceHealth).toHaveBeenCalledWith(
        mockWorkspace.id,
      );
    });

    it('throws ForbiddenException for a non-admin', async () => {
      const { controller, workspaceAbility, docHealth } = buildController();
      workspaceAbility.createForUser.mockReturnValue(memberAbility);

      await expect(
        controller.getWorkspaceHealth(mockUser, mockWorkspace),
      ).rejects.toThrow(ForbiddenException);
      expect(docHealth.getWorkspaceHealth).not.toHaveBeenCalled();
    });
  });

  describe('getSpaceHealth', () => {
    it('throws NotFoundException for an unknown space', async () => {
      const { controller, spaceRepo } = buildController();
      spaceRepo.findById.mockResolvedValue(null);

      await expect(
        controller.getSpaceHealth(
          { spaceId: 'missing' },
          mockAdminUser,
          mockWorkspace,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns score for a workspace admin without space-admin lookup', async () => {
      const { controller, spaceRepo, workspaceAbility, spaceAbility } =
        buildController();
      spaceRepo.findById.mockResolvedValue(mockSpace);
      workspaceAbility.createForUser.mockReturnValue(adminAbility);

      const result = await controller.getSpaceHealth(
        { spaceId: mockSpace.id },
        mockAdminUser,
        mockWorkspace,
      );

      expect(result).toEqual({ score: 85 });
      expect(spaceAbility.createForUser).not.toHaveBeenCalled();
    });

    it('falls back to space-admin check for a non-workspace-admin', async () => {
      const { controller, spaceRepo, workspaceAbility, spaceAbility } =
        buildController();
      spaceRepo.findById.mockResolvedValue(mockSpace);
      workspaceAbility.createForUser.mockReturnValue(memberAbility);
      spaceAbility.createForUser.mockResolvedValue(adminAbility);

      const result = await controller.getSpaceHealth(
        { spaceId: mockSpace.id },
        mockUser,
        mockWorkspace,
      );

      expect(result).toEqual({ score: 85 });
    });

    it('throws ForbiddenException when neither workspace nor space admin', async () => {
      const { controller, spaceRepo, workspaceAbility, spaceAbility } =
        buildController();
      spaceRepo.findById.mockResolvedValue(mockSpace);
      workspaceAbility.createForUser.mockReturnValue(memberAbility);
      spaceAbility.createForUser.mockResolvedValue(memberAbility);

      await expect(
        controller.getSpaceHealth(
          { spaceId: mockSpace.id },
          mockUser,
          mockWorkspace,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getIssues', () => {
    it('rejects a non-admin requesting workspace-wide issues', async () => {
      const { controller, workspaceAbility, issues } = buildController();
      workspaceAbility.createForUser.mockReturnValue(memberAbility);

      await expect(
        controller.getIssues(
          { category: HealthIssueCategory.Outdated, page: 1, limit: 25 },
          mockUser,
          mockWorkspace,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(issues.listIssues).not.toHaveBeenCalled();
    });

    it('allows a workspace admin to fetch any category', async () => {
      const { controller, workspaceAbility, issues } = buildController();
      workspaceAbility.createForUser.mockReturnValue(adminAbility);

      await controller.getIssues(
        { category: HealthIssueCategory.MissingOwner, page: 1, limit: 25 },
        mockAdminUser,
        mockWorkspace,
      );

      expect(issues.listIssues).toHaveBeenCalledWith({
        workspaceId: mockWorkspace.id,
        category: HealthIssueCategory.MissingOwner,
        spaceId: undefined,
        page: 1,
        limit: 25,
      });
    });

    it('allows a space admin to fetch issues scoped to their space', async () => {
      const {
        controller,
        spaceRepo,
        workspaceAbility,
        spaceAbility,
        issues,
      } = buildController();
      spaceRepo.findById.mockResolvedValue(mockSpace);
      workspaceAbility.createForUser.mockReturnValue(memberAbility);
      spaceAbility.createForUser.mockResolvedValue(adminAbility);

      await controller.getIssues(
        {
          category: HealthIssueCategory.WeakContent,
          spaceId: mockSpace.id,
          page: 1,
          limit: 25,
        },
        mockUser,
        mockWorkspace,
      );

      expect(issues.listIssues).toHaveBeenCalled();
    });

    it('rejects a non-space-admin scoped request', async () => {
      const { controller, spaceRepo, workspaceAbility, spaceAbility } =
        buildController();
      spaceRepo.findById.mockResolvedValue(mockSpace);
      workspaceAbility.createForUser.mockReturnValue(memberAbility);
      spaceAbility.createForUser.mockResolvedValue(memberAbility);

      await expect(
        controller.getIssues(
          {
            category: HealthIssueCategory.Outdated,
            spaceId: mockSpace.id,
            page: 1,
            limit: 25,
          },
          mockUser,
          mockWorkspace,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns 404 for an unknown space', async () => {
      const { controller, spaceRepo, workspaceAbility } = buildController();
      spaceRepo.findById.mockResolvedValue(null);
      workspaceAbility.createForUser.mockReturnValue(memberAbility);

      await expect(
        controller.getIssues(
          {
            category: HealthIssueCategory.Outdated,
            spaceId: 'missing',
            page: 1,
            limit: 25,
          },
          mockUser,
          mockWorkspace,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getTrend', () => {
    it('returns trend points for a workspace admin', async () => {
      const { controller, workspaceAbility, snapshots } = buildController();
      workspaceAbility.createForUser.mockReturnValue(adminAbility);

      const result = await controller.getTrend(
        { days: 30 },
        mockAdminUser,
        mockWorkspace,
      );

      expect(result.points).toHaveLength(2);
      expect(snapshots.getTrend).toHaveBeenCalledWith({
        workspaceId: mockWorkspace.id,
        spaceId: null,
        days: 30,
      });
    });

    it('rejects a non-admin requesting workspace-wide trend', async () => {
      const { controller, workspaceAbility, snapshots } = buildController();
      workspaceAbility.createForUser.mockReturnValue(memberAbility);

      await expect(
        controller.getTrend({ days: 7 }, mockUser, mockWorkspace),
      ).rejects.toThrow(ForbiddenException);
      expect(snapshots.getTrend).not.toHaveBeenCalled();
    });

    it('allows a space admin to fetch trend for their space', async () => {
      const {
        controller,
        spaceRepo,
        workspaceAbility,
        spaceAbility,
        snapshots,
      } = buildController();
      spaceRepo.findById.mockResolvedValue(mockSpace);
      workspaceAbility.createForUser.mockReturnValue(memberAbility);
      spaceAbility.createForUser.mockResolvedValue(adminAbility);

      await controller.getTrend(
        { spaceId: mockSpace.id, days: 30 },
        mockUser,
        mockWorkspace,
      );

      expect(snapshots.getTrend).toHaveBeenCalledWith({
        workspaceId: mockWorkspace.id,
        spaceId: mockSpace.id,
        days: 30,
      });
    });

    it('rejects a non-space-admin scoped trend request', async () => {
      const { controller, spaceRepo, workspaceAbility, spaceAbility } =
        buildController();
      spaceRepo.findById.mockResolvedValue(mockSpace);
      workspaceAbility.createForUser.mockReturnValue(memberAbility);
      spaceAbility.createForUser.mockResolvedValue(memberAbility);

      await expect(
        controller.getTrend(
          { spaceId: mockSpace.id, days: 30 },
          mockUser,
          mockWorkspace,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('captureSnapshot', () => {
    it('captures a snapshot for a workspace admin', async () => {
      const { controller, workspaceAbility, snapshots } = buildController();
      workspaceAbility.createForUser.mockReturnValue(adminAbility);

      const result = await controller.captureSnapshot(
        mockAdminUser,
        mockWorkspace,
      );

      expect(snapshots.captureWorkspace).toHaveBeenCalledWith(
        mockWorkspace.id,
        expect.any(Date),
      );
      expect(result.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('rejects a non-admin', async () => {
      const { controller, workspaceAbility, snapshots } = buildController();
      workspaceAbility.createForUser.mockReturnValue(memberAbility);

      await expect(
        controller.captureSnapshot(mockUser, mockWorkspace),
      ).rejects.toThrow(ForbiddenException);
      expect(snapshots.captureWorkspace).not.toHaveBeenCalled();
    });
  });
});
