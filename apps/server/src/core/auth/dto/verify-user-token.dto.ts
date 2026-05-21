import { IsIn, IsString } from 'class-validator';
import { UserTokenType } from '../auth.constants';

export class VerifyUserTokenDto {
  @IsString()
  token: string;

  @IsIn(Object.values(UserTokenType))
  type: UserTokenType;
}
