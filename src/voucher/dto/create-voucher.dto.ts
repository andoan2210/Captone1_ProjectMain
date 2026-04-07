import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateVoucherDto {
  // Mã voucher
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  // Phần trăm giảm giá, từ 1 đến 100
  @IsInt()
  @Min(1)
  @Max(100)
  discountPercent: number;

  // Số lượng voucher được phát hành
  @IsInt()
  @Min(1)
  quantity: number;

  // Ngày hết hạn voucher
  @IsDateString()
  expiredDate: string;

  // Trạng thái active của voucher
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}