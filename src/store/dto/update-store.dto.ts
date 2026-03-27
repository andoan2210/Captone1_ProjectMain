import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateStoreDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  storeName?: string;

  @IsOptional()
  @IsString()
  description?: string;

}