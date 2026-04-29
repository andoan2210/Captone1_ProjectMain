import { IsEnum, IsArray, IsOptional, IsNumber, Min, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum PreviewType {
  CART = 'CART',
  BUY_NOW = 'BUY_NOW',
}

export class StoreVoucherDto {
  @IsNumber()
  storeId: number;

  @IsString()
  code: string;
}

export class PreviewDto {
  @IsEnum(PreviewType)
  type: PreviewType;

  // CART
  @IsOptional()
  @IsArray()
  selectedItems?: number[];

  // BUY NOW
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
}