import { IsEmail, IsNotEmpty, IsString } from "class-validator";

export class ForgotPasswordDto {

  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

}
