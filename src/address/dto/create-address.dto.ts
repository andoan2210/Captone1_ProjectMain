import { IsString, IsBoolean, IsOptional, IsNotEmpty, Length } from 'class-validator';

export class CreateAddressDto {
  @IsString()
  fullName: string;

  @IsString()
  @IsNotEmpty({ message: 'Phone is required' })
  @Length(10,10,{message: 'Phone must be 10 digits'})
  phone: string;

  @IsString()
  @IsNotEmpty({ message: 'Province is required' })
  province: string;

  @IsString()
  @IsNotEmpty({ message: 'District is required' })
  district: string;

  @IsString()
  @IsNotEmpty({ message: 'Ward is required' })
  ward: string;

  @IsString()
  @IsNotEmpty({ message: 'Detail address is required' })
  detailAddress: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

}