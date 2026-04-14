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
  ) { }

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
  //
  async sendAccountForUser(email: string, password: string) {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Tài khoản của bạn đã được tạo',
        html: `
        <div style="font-family: Arial; max-width: 600px; margin: auto;">
          <h2>🎉 Tài khoản của bạn đã được tạo</h2>

          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Mật khẩu:</strong> ${password}</p>

          <p>👉 Vui lòng đăng nhập và đổi mật khẩu ngay để bảo mật.</p>

          <hr />
          <small>Đây là email tự động, vui lòng không trả lời.</small>
        </div>
      `,
      });

      this.logger.log(`Account email sent to ${email}`);
    } catch (error) {
      this.logger.error('Failed to send account email', error);
      throw new BadRequestException('Không gửi được email');
    }
  }
}
