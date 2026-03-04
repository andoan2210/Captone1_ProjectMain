
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class UpdateUserDto  {

    @IsNotEmpty({message: 'Full name is required'})
    @IsString()
    fullName: string;

    @IsString()
    @IsNotEmpty({message: 'Phone is required'})
    phone: string;

    @IsString()
    @IsOptional()
    avatarUrl: string;

}