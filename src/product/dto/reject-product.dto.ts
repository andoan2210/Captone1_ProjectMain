import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}