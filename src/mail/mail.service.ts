import { BadRequestException, Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { RedisService } from '../shared/service/redis.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly CODE_TTL = 300; // 5 minutes in seconds
  private readonly CODE_PREFIX = 'verify:';

  constructor(
    private readonly mailerService: MailerService,
    private readonly redisService: RedisService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

  async sendVerificationCode(email: string) {
    // Generate a random 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in Redis with TTL
    const key = `${this.CODE_PREFIX}${email}`;
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

}
