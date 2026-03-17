import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Post,
  forwardRef,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { Users } from './entities/user.entity';
import { PrismaService } from 'src/prisma/prisma.service';
import { Logger } from 'nestjs-pino';
import { hashPasswordHelpers } from 'src/helpers/util';
import { UpdateUserDto } from './dto/update-user.dto';
import { MailService } from '../mail/mail.service';
import { RedisService } from 'src/shared/service/redis.service';
import { ChangeForgotPasswordDto } from './dto/change-forgot-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { CreateUserGoogleDto } from 'src/auth/dto/create-user-google.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { UploadService } from 'src/upload/upload.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
    @Inject(forwardRef(() => MailService))
    private readonly mailService: MailService,
    private readonly redisService: RedisService,
    private readonly uploadService: UploadService,
  ) {}
  async create(createDto: CreateUserDto) {
    try {
      const { name, email, password } = createDto;

      // Check if email already exists
      const existingUser = await this.prisma.users.findUnique({
        where: { Email: email },
      });

      if (existingUser) {
        throw new BadRequestException(`Email already exists : ${email}`);
      }

      const hashPassword = await hashPasswordHelpers(password);
      const user = await this.prisma.users.create({
        data: {
          FullName: name,
          Email: email,
          PasswordHash: String(hashPassword),
          Role: 'Client',
          IsActive: false,
        },
      });

      // Send verification code to user email
      await this.mailService.sendVerificationCode(email, 'verify-email');

      this.logger.log('Creating new user', {
        data: { name, email, role: user.Role, isActive: user.IsActive },
      });
      return {
        id: user.UserId,
        email: user.Email,
        role: user.Role,
        message: 'User created successfully. Verification code sent to email.',
      };
    } catch (error) {
      this.logger.error('Failed to create user', { error });
      throw new BadRequestException('Failed to create user: ' + error.message);
    }
  }

  async createUserGoogle(createDto: CreateUserGoogleDto) {
    try {
      const { name, email, role, isActive, avatarUrl, providerId } = createDto;

      // Check if email already exists
      const existingUser = await this.prisma.users.findUnique({
        where: { Email: email },
      });

      if (existingUser) {
        throw new BadRequestException(`Email already exists : ${email}`);
      }

      if (role !== 'Client' && role !== 'Shop Owner' && role == 'Admin') {
        throw new BadRequestException(
          `Role is not valid and cannot create user Admin`,
        );
      }
      const user = await this.prisma.users.create({
        data: {
          FullName: name,
          Email: email,
          PasswordHash: '',
          Role: role,
          IsActive: isActive,
          AvatarUrl: avatarUrl,
          AuthProvider: 'google',
          ProviderId: providerId,
        },
      });

      this.logger.log('Creating new user', { data: createDto });
      return {
        id: user.UserId,
        email: user.Email,
        role: user.Role,
        message: 'User created successfully.',
      };
    } catch (error) {
      this.logger.error('Failed to create user', { error });
      throw new BadRequestException('Failed to create user: ' + error.message);
    }
  }

  async findAll(page: number, limit: number) {
    try {
      const skip = (page - 1) * limit;

      const [totalItems, users] = await Promise.all([
        this.prisma.users.count(),
        this.prisma.users.findMany({
          skip,
          take: limit,
          select: {
            UserId: true,
            FullName: true,
            Email: true,
            Phone: true,
            Role: true,
            IsActive: true,
          },
        }),
      ]);

      this.logger.log('Fetching users', { data: users });
      return {
        data: users,
        meta: {
          totalItems,
          itemCount: users.length,
          itemsPerPage: limit,
          totalPages: Math.ceil(totalItems / limit),
          currentPage: page,
        },
      };
    } catch (error) {
      this.logger.error('Failed to fetch users', { error });
      throw new BadRequestException('Failed to fetch users: ' + error.message);
    }
  }

  async findByEmail(email: string): Promise<Users> {
    try {
      const user = await this.prisma.users.findUnique({
        where: { Email: email },
      });

      if (!user) {
        throw new NotFoundException(`User not found: ${email}`);
      }
      this.logger.log('Fetching user', { data: user });
      return user;
    } catch (error) {
      this.logger.error('Failed to fetch user', { error });
      throw new BadRequestException('Failed to fetch user: ' + error.message);
    }
  }
  async findByEmailGoogle(email: string): Promise<Users | null> {
    try {
      const user = await this.prisma.users.findUnique({
        where: { Email: email },
      });
      if (!user) {
        return null;
      }
      this.logger.log('Fetching user', { data: user });
      return user;
    } catch (error) {
      this.logger.error('Failed to fetch user', { error });
      throw new BadRequestException('Failed to fetch user: ' + error.message);
    }
  }

  async findOne(id: number) {
    try {
      const user = await this.prisma.users.findUnique({
        where: { UserId: id },
        select: {
          UserId: true,
          FullName: true,
          Email: true,
          Role: true,
          Phone: true,
          IsActive: true,
        },
      });

      if (!user) {
        throw new NotFoundException(`User not found: ${id}`);
      }
      this.logger.log('Fetching user', { data: user });
      return user;
    } catch (error) {
      this.logger.error('Failed to fetch user', { error });
      throw new BadRequestException('Failed to fetch user: ' + error.message);
    }
  }

  async updateProfile(
    id: number,
    updateDto: UpdateUserDto,
    file?: Express.Multer.File,
  ) {
    try {
      const existingUser = await this.prisma.users.findUnique({
        where: { UserId: id },
      });

      if (!existingUser) {
        throw new NotFoundException(`User not found: ${id}`);
      }

      let avatarUrl = existingUser.AvatarUrl;
      if (file) {
        if (existingUser.AvatarUrl) {
          await this.uploadService.deleteFile(existingUser.AvatarUrl);
        }
        avatarUrl = await this.uploadService.uploadImage(file, 'avatars');
      }

      const user = await this.prisma.users.update({
        where: { UserId: id },
        data: {
          FullName: updateDto.fullName,
          Phone: updateDto.phone,
          AvatarUrl: avatarUrl,
          UpdatedAt: new Date(),
          DateOfBirth: updateDto.dateOfBirth,
          Gender: updateDto.gender,
        },
      });
      this.logger.log('Updating user', { data: updateDto });
      return {
        id: user.UserId,
        role: user.Role,
        message: 'User updated successfully',
      };
    } catch (error) {
      this.logger.error('Failed to update user', { error });
      throw new BadRequestException('Failed to update user: ' + error.message);
    }
  }

  async remove(email: string) {
    try {
      const existingUser = await this.prisma.users.findUnique({
        where: { Email: email },
      });

      if (!existingUser) {
        throw new NotFoundException(`User not found: ${email}`);
      }
      const user = await this.prisma.users.delete({
        where: { Email: email },
      });
      this.logger.log('Deleting user', { data: user });
      return {
        message: 'User deleted successfully',
      };
    } catch (error) {
      this.logger.error('Failed to delete user', { error });
      throw new BadRequestException('Failed to delete user: ' + error.message);
    }
  }

  // gọi ngoài phần quên mật khẩu ở login gửi mã xác thực về mail , có thể gọi ở nút gửi lại code set côldown 60s
  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    try {
      const email = forgotPasswordDto.email;

      // check cooldown
      const cooldownKey = `cooldown:forgot:${email}`;
      const cooldown = await this.redisService.get(cooldownKey);

      if (cooldown) {
        throw new BadRequestException(
          'Please wait 60 seconds before requesting another code',
        );
      }

      const user = await this.prisma.users.findUnique({
        where: { Email: email },
      });

      if (!user) {
        throw new NotFoundException(`User not found: ${email}`);
      }

      if (user.IsActive === false) {
        throw new BadRequestException('User is not active');
      }
      await this.mailService.sendVerificationCode(email, 'forgot');

      // set cooldown 60s
      await this.redisService.set(cooldownKey, '1', 60);

      this.logger.log('Forgot password', { email });

      return {
        message: 'Verification code sent to email',
      };
    } catch (error) {
      this.logger.error('Failed to forgot password', { error });
      throw new BadRequestException(
        'Failed to forgot password: ' + error.message,
      );
    }
  }

  async verifyCode(
    email: string,
    code: string,
    type: 'verify-email' | 'forgot',
  ) {
    const storedCode = await this.redisService.get(`${type}:${email}`);

    if (!storedCode) {
      throw new BadRequestException('Verification code expired');
    }

    if (storedCode !== code.trim()) {
      throw new BadRequestException('Invalid verification code');
    }

    await this.redisService.del(`${type}:${email}`);

    return true;
  }

  // Nhập mã để verify mail khi đăng kí
  async verifyEmailCode(verifyEmailDto: VerifyEmailDto) {
    await this.verifyCode(
      verifyEmailDto.email,
      verifyEmailDto.code,
      'verify-email',
    );

    await this.prisma.users.update({
      where: { Email: verifyEmailDto.email },
      data: { IsActive: true },
    });
    this.logger.log('Email verified successfully', {
      email: verifyEmailDto.email,
    });
    return { message: 'Email verified successfully' };
  }

  // nhập mã gửi về mail để thay đổi mật khẩu
  async verifyForgotPasswordCode(verifyEmailDto: VerifyEmailDto) {
    await this.verifyCode(verifyEmailDto.email, verifyEmailDto.code, 'forgot');

    // cho phép đổi password trong 10 phút
    await this.redisService.set(
      `reset-allowed:${verifyEmailDto.email}`,
      'true',
      600,
    );

    return {
      email: verifyEmailDto.email,
      message: 'Code verified. You can change password now.',
    };
  }

  async updateNewPassword(changeForgotPasswordDto: ChangeForgotPasswordDto) {
    try {
      const allowed = await this.redisService.get(
        `reset-allowed:${changeForgotPasswordDto.email}`,
      );

      if (!allowed) {
        throw new BadRequestException('Please verify code first');
      }

      const user = await this.prisma.users.findUnique({
        where: { Email: changeForgotPasswordDto.email },
      });

      if (!user) {
        throw new NotFoundException(
          `User not found: ${changeForgotPasswordDto.email}`,
        );
      }

      const hashPassword = await hashPasswordHelpers(
        changeForgotPasswordDto.newPassword,
      );

      await this.prisma.users.update({
        where: { Email: changeForgotPasswordDto.email },
        data: {
          PasswordHash: String(hashPassword),
          UpdatedAt: new Date(),
        },
      });

      // xóa quyền reset sau khi dùng
      await this.redisService.del(
        `reset-allowed:${changeForgotPasswordDto.email}`,
      );

      return {
        message: 'Password updated successfully',
      };
    } catch (error) {
      throw new BadRequestException(
        'Failed to update password: ' + error.message,
      );
    }
  }

  async resendVerificationCode(email: string) {
    try {
      const cooldownKey = `cooldown:verify:${email}`;
      const cooldown = await this.redisService.get(cooldownKey);

      if (cooldown) {
        throw new BadRequestException(
          'Please wait 60 seconds before requesting another code',
        );
      }

      const user = await this.prisma.users.findUnique({
        where: { Email: email },
      });

      if (!user) {
        throw new NotFoundException(`User not found: ${email}`);
      }

      if (user.IsActive) {
        throw new BadRequestException('Email already verified');
      }

      await this.mailService.sendVerificationCode(email, 'verify-email');

      // set cooldown 60s
      await this.redisService.set(cooldownKey, '1', 60);

      this.logger.log('Resending verification code', { email });

      return {
        message: 'Verification code resent successfully',
      };
    } catch (error) {
      this.logger.error('Failed to resend verification code', { error });
      throw new BadRequestException(
        'Failed to resend verification code: ' + error.message,
      );
    }
  }
}
