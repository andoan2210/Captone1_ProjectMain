import { IsInt, IsString, IsNotEmpty, IsArray, IsOptional } from 'class-validator';

export class CreateReportDto {
  @IsInt()
  @IsNotEmpty()
  productId: number;

  @IsString()
  @IsNotEmpty()
  reportType: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  evidenceImages?: string[];
}
