import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsNotEmpty({ message: 'Product name is required' })
  @IsString()
  @Length(3, 200, { message: 'Product name must be between 3 and 200 characters' })
  productName: string;

  @IsNotEmpty({ message: 'Category is required' })
  @Type(() => Number)
  @IsInt({ message: 'Category id must be an integer' })
  @Min(1, { message: 'Category id must be greater than 0' })
  categoryId: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty({ message: 'Thumbnail url is required' })
  @IsString()
  @IsUrl({}, { message: 'Thumbnail url must be a valid URL' })
  thumbnailUrl: string;

  @IsOptional()
  @IsArray({ message: 'Image urls must be an array' })
  @ArrayMaxSize(10, { message: 'You can upload up to 10 product images' })
  @IsUrl({}, { each: true, message: 'Each image url must be a valid URL' })
  imageUrls?: string[];

  @IsNotEmpty({ message: 'Price is required' })
  @Type(() => Number)
  @IsNumber({}, { message: 'Price must be a valid number' })
  @Min(0.01, { message: 'Price must be greater than 0' })
  price: number;

  @IsNotEmpty({ message: 'Stock is required' })
  @Type(() => Number)
  @IsInt({ message: 'Stock must be an integer' })
  @Min(0, { message: 'Stock must be greater than or equal to 0' })
  stock: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'Is active must be a boolean value' })
  isActive?: boolean;
}