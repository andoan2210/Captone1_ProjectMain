import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class CreateUserDto {
  @IsNotEmpty({ message: 'Name is required' })
  @IsString()
  name: string;

  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @IsNotEmpty({ message: 'Password is required' })
  @IsString()
  @Length(6, 30, { message: 'Password must be at least 6 characters long' })
  password: string;

  @IsString()
  role: string = "Client";

  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean value' })
  isActive: boolean = false;
} 
