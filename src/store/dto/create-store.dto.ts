import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateStoreDto {
  @IsString()
  @IsNotEmpty({ message: 'Tên cửa hàng không được để trống' })
  storeName: string;

  @IsString()
  @IsOptional()
  description?: string;
}
