import { IsNotEmpty, IsNumber, IsPositive } from 'class-validator';

export class CreateCartDto {
  @IsNotEmpty()
  @IsNumber()
  variantId: number;
  
  @IsNotEmpty()
  @IsNumber()
  quantity: number;
}
