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
  isMeetingCreator,
  isMeetingId,
  isWriteMethod,
  MEETING_READ_ONLY_MESSAGE,
} from './meeting-access.util';
import { meetingSharedWith } from './meeting-share.util';

/**
 * Every /ai/meeting/:id route goes through here: the meeting must exist,
 * not be deleted, and be readable by the caller (canReadMeeting: its creator,
 * or someone it was shared with, in its company; no role grants access).
 * Anyone else gets 404 rather than 403, so a meeting id never confirms that
 * a colleague's or another company's meeting exists. Changing it (any method
 * but GET) also needs canWriteMeeting (the creator): someone it is shared
 * with gets 403. The service checks reads and writes again.
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
    // The share lookup runs only for someone other than the creator.
    const shared =
      !isMeetingCreator(meeting, viewer) &&
      (await meetingSharedWith(this.db, id, viewer));
    if (!canReadMeeting(meeting, viewer, shared)) {
      throw new NotFoundException('Meeting not found');
    }
    if (isWriteMethod(req.method) && !canWriteMeeting(meeting, viewer)) {
      throw new ForbiddenException(MEETING_READ_ONLY_MESSAGE);
    }
    return true;
  }
}
