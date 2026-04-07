import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GetMyVouchersDto {
  // Trang hiện tại
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  // Số lượng item mỗi trang
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  // Từ khóa tìm theo mã voucher
  @IsOptional()
  @IsString()
  search?: string;

  // Trạng thái lọc: all | active | inactive | expired
  @IsOptional()
  @IsIn(['all', 'active', 'inactive', 'expired'])
  status?: 'all' | 'active' | 'inactive' | 'expired' = 'all';
}