import { IsString, IsNotEmpty, IsBoolean, IsOptional, Matches, Length, IsEnum } from 'class-validator';
import { PaymentMethodType, PaymentProvider } from '../enums/type.enum';

export class CreatePaymentMethodDto {
  @IsEnum(PaymentMethodType)
  @IsNotEmpty({ message: 'Type is required' })
  type: PaymentMethodType;

  @IsEnum(PaymentProvider)
  @IsNotEmpty({ message: 'Provider is required' })
  provider: PaymentProvider;


  @IsString()
  @Matches(/^[0-9]+$/, { message: 'Account number must be numeric' })
  @Length(8, 20, { message: 'Account number must be 8-20 digits' })
  
  accountNumber: string;

  @IsString()
  @Matches(/^[a-zA-ZÀ-ỹ\s]+$/, {
    message: 'Card holder name must be letters only',
  })
  cardHolderName: string;

  @IsBoolean()
  @IsOptional()
  isDefault: boolean;
}
