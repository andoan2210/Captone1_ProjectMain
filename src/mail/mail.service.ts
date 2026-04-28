import { BadRequestException, Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { RedisService } from '../shared/service/redis.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly CODE_TTL = 300; // 5 p 
  private readonly CODE_PREFIX = 'verify:';

  constructor(
    private readonly mailerService: MailerService,
    private readonly redisService: RedisService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

  async sendVerificationCode(
    email: string,
    type: string,
  ) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const key = `${type}:${email}`;

    await this.redisService.set(key, code, this.CODE_TTL);
    // Send email
    await this.mailerService.sendMail({
      to: email,
      subject: 'Your Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Email Verification</h2>
          <p>Your verification code is:</p>
          <h1 style="color: #4CAF50; letter-spacing: 5px; text-align: center;">${code}</h1>
          <p>This code will expire in <strong>5 minutes</strong>.</p>
          <p>If you did not request this code, please ignore this email.</p>
        </div>
      `,
    });

    this.logger.log(`Verification code sent to ${email}`);
    return { message: `Verification code sent to ${email}` };
  }

  // Gửi email thông báo tài khoản được Admin tạo kèm mật khẩu
  async sendAdminCreatedAccount(email: string, name: string, password: string) {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Tài khoản của bạn đã được tạo',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a56db;">Chào ${name},</h2>
          <p>Tài khoản của bạn đã được tạo bởi quản trị viên hệ thống.</p>
          <div style="background: #f0f5ff; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0 0 8px 0;"><strong>Email:</strong> ${email}</p>
            <p style="margin: 0;"><strong>Mật khẩu tạm thời:</strong></p>
            <h2 style="color: #dc2626; letter-spacing: 2px; text-align: center; background: #fff; padding: 12px; border-radius: 6px; margin: 8px 0;">${password}</h2>
          </div>
          <p style="color: #dc2626;"><strong>⚠️ Vui lòng đổi mật khẩu ngay sau khi đăng nhập lần đầu.</strong></p>
          <p>Bạn cũng cần xác nhận email bằng mã xác minh đã được gửi riêng.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="color: #9ca3af; font-size: 12px;">Email này được gửi tự động, vui lòng không trả lời.</p>
        </div>
      `,
    });
    this.logger.log(`Admin-created account email sent to ${email}`);
  }

}
