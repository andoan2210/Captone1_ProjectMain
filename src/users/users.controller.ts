import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Request, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendCodeDto } from './dto/resend-code.dto';
import { ChangeForgotPasswordDto } from './dto/change-forgot-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/auth/passport/jwt-auth.guard';
import { RolesGuard } from 'src/auth/passport/roles.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }
  
 @Get('getAllUsers')
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

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('avatar'))
  updateProfile(
    @Request() req,
    @Body() updateDto: UpdateUserDto, @UploadedFile() avatar: Express.Multer.File) {
    return this.usersService.updateProfile(req.user.userId,updateDto, avatar);
  }


  @Delete()
  remove(@Body() body: { email: string }) {
    return this.usersService.remove(body.email);
  }

  // Nhập mã để verify mail khi đăng kí tài khoản
  @Post('verify-email')
  verifyEmail(@Body() body: VerifyEmailDto) {
    return this.usersService.verifyEmailCode(body);
  }

  // Quên mật khẩu 
  @Post('forgot-password')
  forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.usersService.forgotPassword(body);
  }
  
  // Nhập mã gửi về mail để thay đổi mật khẩu
  @Post('verify-forgot-password-code')
  verifyForgotPasswordCode(@Body() body: VerifyEmailDto ){
    return this.usersService.verifyForgotPasswordCode(body);
  }
  // Thay đổi mật khẩu
  @Post('change-forgot-password')
  changeForgotPassword(@Body() body: ChangeForgotPasswordDto) {
    return this.usersService.updateNewPassword(body);
  }

  // Gửi lại mã khi đăng kí tài khoản
  @Post('resend-code')
  resendVerification(@Body() dto: ResendCodeDto) {
    return this.usersService.resendVerificationCode(dto.email);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }
}
