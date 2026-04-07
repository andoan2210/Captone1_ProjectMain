import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateVoucherDto {
  // Mã voucher mới nếu muốn đổi
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  // Phần trăm giảm giá mới
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  discountPercent?: number;

  // Số lượng voucher mới
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  // Ngày hết hạn mới
  @IsOptional()
  @IsDateString()
  expiredDate?: string;

  // Trạng thái hoạt động mới
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}