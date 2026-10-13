import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { canReadMeeting } from './meeting-access.util';

/**
 * Every /ai/meeting/:id route goes through here: the meeting must exist in
 * the caller's workspace and the caller must be allowed to read it
 * (canReadMeeting). Answers 404 rather than 403 so a meeting id never
 * confirms that someone else's interview exists.
 */
@Injectable()
export class MeetingAccessGuard implements CanActivate {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly spaceMembers: SpaceMemberRepo,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const id: string | undefined = req.params?.id;
    if (!id) return true; // list, start, upload: scoped in the service
    const user = req.user?.user;
    const workspace = req.raw?.workspace ?? req.user?.workspace;
    if (!user || !workspace) throw new NotFoundException('Meeting not found');
    const meeting = await this.db
      .selectFrom('meetings')
      .select(['userId', 'workspaceId', 'spaceId', 'settings'])
      .where('id', '=', id)
      .where('deletedAt', 'is', null)
      .executeTakeFirst()
      .catch(() => undefined); // malformed uuid
    if (!meeting) throw new NotFoundException('Meeting not found');
    const spaceIds = meeting.userId === user.id ? [] : await this.spaceMembers.getUserSpaceIds(user.id);
    if (!canReadMeeting(meeting, { id: user.id, role: user.role, workspaceId: workspace.id }, spaceIds)) {
      throw new NotFoundException('Meeting not found');
    }
    return true;
  }
}
