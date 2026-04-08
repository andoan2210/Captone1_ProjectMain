import { IsEnum, IsArray, IsOptional, IsNumber, Min, IsString } from 'class-validator';

export enum PreviewType {
  CART = 'CART',
  BUY_NOW = 'BUY_NOW',
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

  @IsOptional()
  @IsString()
  voucherCode?: string;
}