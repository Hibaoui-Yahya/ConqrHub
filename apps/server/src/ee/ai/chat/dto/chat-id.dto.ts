import { IsString, IsUUID } from 'class-validator';

export class ChatIdDto {
  @IsUUID()
  @IsString()
  chatId: string;
}
