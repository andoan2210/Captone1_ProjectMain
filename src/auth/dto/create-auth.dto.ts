import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class CreateAuthDto {
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail()
  username: string;

  @IsNotEmpty({ message: 'Password is required' })
  @IsString({ message: 'Password must be a string' })
  password: string;
}
