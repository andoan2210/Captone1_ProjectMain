import { IsEmail, IsNotEmpty, IsString } from "class-validator";

export class VerifyEmailDto{
    @IsEmail({}, { message: 'Please provide a valid email address' })
    email  : string;
    @IsString()
    @IsNotEmpty({ message: 'Code is required' })
    code : string;
}
