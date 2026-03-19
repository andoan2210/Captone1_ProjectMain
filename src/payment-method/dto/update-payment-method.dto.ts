import { IsString, IsNotEmpty, IsBoolean, IsOptional, Matches, Length, IsEnum } from 'class-validator';
import { PaymentMethodType, PaymentProvider } from '../enums/type.enum';

export class UpdatePaymentMethodDto {
  @IsEnum(PaymentMethodType)
  @IsOptional()
  type?: PaymentMethodType;

  @IsEnum(PaymentProvider)
  @IsOptional()
  provider?: PaymentProvider;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]+$/, { message: 'Account number must be numeric' })
  @Length(8, 20, { message: 'Account number must be 8-20 digits' })
  
  accountNumber?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-ZÀ-ỹ\s]+$/, {
    message: 'Card holder name must be letters only',
  })
  cardHolderName?: string;

  @IsOptional()
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
