import { IsIn, IsString } from 'class-validator';

export class AiOutputDto {
  @IsString()
  @IsIn(['summary', 'actions', 'decisions'])
  key!: 'summary' | 'actions' | 'decisions';

  @IsString()
  value!: string;
}
