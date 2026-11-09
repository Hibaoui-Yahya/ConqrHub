import { IsInt } from 'class-validator';

/** POST /ai/meeting/:id/transcript/remove-echoes — drop microphone lines that repeat the meeting audio. */
export class RemoveEchoesDto {
  @IsInt()
  baseVersion!: number;
}
