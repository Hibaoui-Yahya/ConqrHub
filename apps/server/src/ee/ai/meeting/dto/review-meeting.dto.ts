import { IsIn, IsString } from 'class-validator';

/** POST /ai/meeting/:id/review — close or reopen the human review stage. */
export class ReviewMeetingDto {
  @IsString()
  @IsIn(['complete', 'reopen'])
  action!: 'complete' | 'reopen';
}
