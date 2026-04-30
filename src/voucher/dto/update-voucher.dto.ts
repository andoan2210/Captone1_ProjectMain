import { IsOptional, IsString, IsInt, Min, IsBoolean, IsDateString, Max } from 'class-validator';

export class UpdateVoucherDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  discountPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsDateString()
  expiredDate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  minOrderValue?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxDiscountValue?: number;

  @IsOptional()
  @IsString()
  applyType?: 'ALL' | 'SPECIFIC';

  @IsOptional()
  @IsInt({ each: true })
  productIds?: number[];
}