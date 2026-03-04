import { BadRequestException, Inject, Injectable, NotFoundException, Post, forwardRef } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import {Users} from './entities/user.entity'
import { PrismaService } from 'src/prisma/prisma.service';
import { Logger } from 'nestjs-pino';
import { hashPasswordHelpers } from 'src/helpers/util';
import { UpdateUserDto } from './dto/update-user.dto';
import { MailService } from '../mail/mail.service';
import { RedisService } from 'src/shared/service/redis.service';

@Injectable()
export class UsersService {

    constructor(
        private readonly prisma: PrismaService,
        private readonly logger : Logger,
        @Inject(forwardRef(() => MailService))
        private readonly mailService: MailService,
        private readonly redisService: RedisService,
    ) {}
  async create(createDto: CreateUserDto) {
    try {  
      const {name,email,password,role} = createDto;

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
          Role: role,
          IsActive: false,
        },
      });

      // Send verification code to user's email
      await this.mailService.sendVerificationCode(email);

      this.logger.log('Creating new user', { data: createDto });
      return {
        id : user.UserId,
        email : user.Email,
        roll : user.Role,
        message : 'User created successfully. Verification code sent to email.',
      }
    } catch (error) {
      this.logger.error('Failed to create user', { error });
      throw new BadRequestException('Failed to create user: ' + error.message);
    }
  }

  async findAll(page: number , limit: number ) {
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

  async findByEmail(email: string) {
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

  async update(id: number, updateDto: UpdateUserDto) {
    try {
      const existingUser = await this.prisma.users.findUnique({
        where: { UserId: id },
      });

      if (!existingUser) {
        throw new NotFoundException(`User not found: ${id}`);
      }
      const user = await this.prisma.users.update({
        where: { UserId: id },
        data:{
            FullName : updateDto.fullName,
            Phone : updateDto.phone,
            AvatarUrl : updateDto.avatarUrl,
            UpdatedAt : new Date(),
        },
      });
      this.logger.log('Updating user', { data: updateDto });
      return {
        id : user.UserId,
        roll : user.Role,
        message : 'User updated successfully',
      }
    } catch (error) {
      this.logger.error('Failed to update user', { error });
      throw new BadRequestException('Failed to update user: ' + error.message);
    }
  }

  async remove(email : string) {
    try {
      const existingUser = await this.prisma.users.findUnique({
        where: { Email : email },
      });

      if (!existingUser) {
       throw new NotFoundException(`User not found: ${email}`);
      }
      const user = await this.prisma.users.delete({
        where: { Email : email },
      });
      this.logger.log('Deleting user', { data: user });
      return {
        message : 'User deleted successfully',
      }
    } catch (error) {
      this.logger.error('Failed to delete user', { error });
      throw new BadRequestException('Failed to delete user: ' + error.message);
    }
  }


  async verifyEmailCode(email: string, code: string) {
  const storedCode = await this.redisService.get(`verify:${email}`);

  if (!storedCode) {
    throw new BadRequestException('Verification code expired');
  }

  if (storedCode !== code) {
    throw new BadRequestException('Invalid verification code');
  }

  await this.prisma.users.update({
    where: { Email: email },
    data: { IsActive: true },
  });

  await this.redisService.del(`verify:${email}`);

  return { message: 'Email verified successfully' };
}

}

