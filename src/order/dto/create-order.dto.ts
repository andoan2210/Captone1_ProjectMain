import { IsEnum, IsArray, IsOptional, IsNumber, Min, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PreviewType, StoreVoucherDto } from './preview.dto';

export class CreateOrderDto {
  @IsEnum(PreviewType)
  type: PreviewType;

  @IsOptional()
  @IsArray()
  selectedItems?: number[];

  @IsOptional()
  @IsNumber()
  variantId?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  // Voucher cho từng shop (Shopee-style)
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StoreVoucherDto)
  storeVouchers?: StoreVoucherDto[];

  // Backward compat: 1 voucher cho BUY_NOW hoặc 1 shop
  @IsOptional()
  @IsString()
  voucherCode?: string;

  @IsNumber()
  addressId: number;

  @IsString()
  paymentMethod: string; // 'MOMO' hoặc 'COD'
}
