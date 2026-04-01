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
import { Transform, Type } from 'class-transformer';

export class CreateProductDto {
  @IsNotEmpty({ message: 'Product name is required' })
  @IsString()
  @Length(3, 200, {
    message: 'Product name must be between 3 and 200 characters',
  })
  productName: string;

  @IsNotEmpty({ message: 'Category is required' })
  @Type(() => Number)
  @IsInt({ message: 'Category id must be an integer' })
  @Min(1, { message: 'Category id must be greater than 0' })
  categoryId: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean({ message: 'Is active must be a boolean value' })
  isActive?: boolean;

  @IsNotEmpty({ message: 'Variants is required' })
  @IsString({ message: 'Variants must be a JSON string' })
  variants: string;
}