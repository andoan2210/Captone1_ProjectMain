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

  // Giá trị đơn hàng tối thiểu
  @IsOptional()
  @IsInt()
  @Min(0)
  minOrderValue?: number;

  // Số tiền giảm tối đa
  @IsOptional()
  @IsInt()
  @Min(0)
  maxDiscountValue?: number;

  // Loại áp dụng: ALL hoặc SPECIFIC
  @IsOptional()
  @IsString()
  applyType?: 'ALL' | 'SPECIFIC';

  // Danh sách ID sản phẩm áp dụng (nếu applyType là SPECIFIC)
  @IsOptional()
  @IsInt({ each: true })
  productIds?: number[];
}