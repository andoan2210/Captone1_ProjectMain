import { IsNotEmpty, IsOptional, IsString, IsInt } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  CategoryName: string;

  @IsOptional()
  @IsInt()
  ParentId?: number;
}
