import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export const FEEDBACK_RATINGS = ['up', 'down'] as const;
export type FeedbackRating = (typeof FEEDBACK_RATINGS)[number];

/** POST ai/chats/feedback */
export class MessageFeedbackDto {
  @IsUUID()
  messageId: string;

  @IsIn(FEEDBACK_RATINGS)
  rating: FeedbackRating;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
