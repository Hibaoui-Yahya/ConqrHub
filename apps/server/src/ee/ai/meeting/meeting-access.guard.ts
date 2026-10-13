import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { validate as isUuid } from 'uuid';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { canReadMeeting, canWriteMeeting, isWriteMethod } from './meeting-access.util';

/**
 * Every /ai/meeting/:id route goes through here: the meeting must exist in
 * the caller's workspace and the caller must be allowed to read it
 * (canReadMeeting). Answers 404 rather than 403 so a meeting id never
 * confirms that someone else's interview exists. Changing it (any method
 * but GET) also needs canWriteMeeting: a reader of the mandate space can
 * read the report, not delete it or rewrite its evaluation (403).
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
    if (!user || !workspace || !isUuid(id)) throw new NotFoundException('Meeting not found');
    // Database errors propagate (500): an outage must not look like "not found".
    const meeting = await this.db
      .selectFrom('meetings')
      .select(['userId', 'workspaceId', 'spaceId', 'settings'])
      .where('id', '=', id)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (!meeting) throw new NotFoundException('Meeting not found');
    const viewer = { id: user.id, role: user.role, workspaceId: workspace.id };
    const spaceIds = meeting.userId === user.id ? [] : await this.spaceMembers.getUserSpaceIds(user.id);
    if (!canReadMeeting(meeting, viewer, spaceIds)) {
      throw new NotFoundException('Meeting not found');
    }
    if (isWriteMethod(req.method) && !canWriteMeeting(meeting, viewer)) {
      throw new ForbiddenException('Only the author of this meeting or an administrator can change it.');
    }
    return true;
  }
}
