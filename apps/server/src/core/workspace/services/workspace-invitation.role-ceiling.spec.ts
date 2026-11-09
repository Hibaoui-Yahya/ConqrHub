import { ForbiddenException } from '@nestjs/common';
import { WorkspaceInvitationService } from './workspace-invitation.service';
import { UserRole } from '../../../common/helpers/types/permission';

/**
 * An invitation must not grant more than its author holds. Role changes
 * already block admin → owner; invitations used to accept `role: owner` from
 * any admin, which let an admin mint new owners.
 */
describe('WorkspaceInvitationService role ceiling', () => {
  const workspace = { id: 'w1' } as any;
  const create = (authRole: UserRole, role: UserRole) =>
    WorkspaceInvitationService.prototype.createInvitation.call(
      // The check runs before any dependency is touched.
      {},
      { emails: ['new@example.test'], role, groupIds: [] } as any,
      workspace,
      { id: 'u1', role: authRole } as any,
    );

  it('refuses an owner invitation sent by an admin', async () => {
    await expect(create(UserRole.ADMIN, UserRole.OWNER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('refuses an owner invitation sent by a member', async () => {
    await expect(
      create(UserRole.MEMBER, UserRole.OWNER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets an admin invite admins and members (reaches the database step)', async () => {
    // With no database the call fails later, but not on the role ceiling.
    await expect(
      create(UserRole.ADMIN, UserRole.ADMIN),
    ).rejects.not.toBeInstanceOf(ForbiddenException);
  });
});
