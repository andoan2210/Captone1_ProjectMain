import { Controller, Post, Body } from '@nestjs/common';
import { MailService } from './mail.service';
import { SendVerificationDto } from './dto/send-verification.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';

@Controller('mail')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post('send-verification')
  sendVerificationCode(@Body() dto: SendVerificationDto) {
    return this.mailService.sendVerificationCode(dto.email, dto.type);
  }

}
