import { IsOptional, IsString } from 'class-validator';

export class GetSuggestionDto {
  @IsOptional()
  @IsString()
  keyword?: string;
}
