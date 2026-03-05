import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendCodeDto } from './dto/resend-code.dto';
import { ChangeForgotPasswordDto } from './dto/change-forgot-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }
  
 @Get()
 findAll(
   @Query('page') page = '1',
   @Query('limit') limit = '10',
   ){
    const pageNum = Number(page);
    const limitNum = Number(limit);

    return this.usersService.findAll(
        pageNum > 0 ? pageNum : 1,
        limitNum > 0 ? limitNum : 10,
    );
 }

  @Get('email')
  findByEmail(@Query('email') email: string) {
    return this.usersService.findByEmail(email);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateUserDto) {
    return this.usersService.updateProfile(+id, updateDto);
  }


  @Delete()
  remove(@Body() body: { email: string }) {
    return this.usersService.remove(body.email);
  }

  @Post('forgot-password')
  forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.usersService.forgotPassword(body);
  }

  @Post('change-forgot-password')
  changeForgotPassword(@Body() body: ChangeForgotPasswordDto) {
    return this.usersService.changeForgotPassword(body);
  }

  @Post('verify-email')
  verifyEmail(@Body() body: { email: string; code: string }) {
    return this.usersService.verifyEmailCode(body.email, body.code);
  }

  @Post('resend-code')
  resendVerification(@Body() dto: ResendCodeDto) {
    return this.usersService.resendVerificationCode(dto.email);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }
}
