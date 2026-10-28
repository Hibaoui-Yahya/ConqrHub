import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import {
  canReadMeeting,
  canWriteMeeting,
  isMeetingId,
  isWriteMethod,
  MEETING_READ_ONLY_MESSAGE,
} from './meeting-access.util';

/**
 * Every /ai/meeting/:id route goes through here: the meeting must exist,
 * not be deleted, and be the caller's own (canReadMeeting: its creator in
 * its company; no role grants access). Anyone else gets 404 rather than 403,
 * so a meeting id never confirms that a colleague's or another company's
 * interview exists. Changing it (any method but GET) also needs
 * canWriteMeeting; the service checks reads and writes again.
 */
@Injectable()
export class MeetingAccessGuard implements CanActivate {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const id: string | undefined = req.params?.id;
    if (!id) return true; // list, start, upload: scoped in the service
    const user = req.user?.user;
    const workspace = req.raw?.workspace ?? req.user?.workspace;
    if (!user || !workspace || !isMeetingId(id)) {
      throw new NotFoundException('Meeting not found');
    }
    // Database errors propagate (500): an outage must not look like "not found".
    const meeting = await this.db
      .selectFrom('meetings')
      .select(['userId', 'workspaceId'])
      .where('id', '=', id)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (!meeting) throw new NotFoundException('Meeting not found');
    const viewer = { id: user.id, role: user.role, workspaceId: workspace.id };
    if (!canReadMeeting(meeting, viewer)) {
      throw new NotFoundException('Meeting not found');
    }
    if (isWriteMethod(req.method) && !canWriteMeeting(meeting, viewer)) {
      throw new ForbiddenException(MEETING_READ_ONLY_MESSAGE);
    }
    return true;
  }
}
