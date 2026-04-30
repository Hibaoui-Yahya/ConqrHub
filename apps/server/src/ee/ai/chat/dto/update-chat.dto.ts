import { IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateChatDto {
  @IsUUID()
  @IsString()
  chatId: string;

  @IsString()
  @MaxLength(255)
  title: string;
}
