import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class SendVerificationDto {
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @IsNotEmpty({ message: 'Type is required' })
  @IsString()
  type: string;
}
