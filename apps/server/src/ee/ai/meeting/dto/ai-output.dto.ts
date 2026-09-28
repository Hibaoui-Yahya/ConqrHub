import { IsIn, IsString } from 'class-validator';

export class AiOutputDto {
  @IsString()
  @IsIn(['summary', 'actions', 'decisions', 'next_steps'])
  key!: 'summary' | 'actions' | 'decisions' | 'next_steps';

  @IsString()
  value!: string;
}
