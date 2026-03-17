
import { IsBoolean, IsDate, IsEmail, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateUserDto  {

    @IsNotEmpty({message: 'Full name is required'})
    @IsString()
    fullName: string;

    @IsString()
    @IsNotEmpty({message: 'Phone is required'})
    phone: string;

    @IsDate({message: 'Date of birth format : YYYY-MM-DD'})
    @Type(() => Date)
    dateOfBirth: Date;

    @IsString()
    gender: string;


}