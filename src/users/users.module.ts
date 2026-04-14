import { Module, forwardRef } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
//
import { AdminUsersController } from './admin-users.controller';
import { MailModule } from '../mail/mail.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [forwardRef(() => MailModule), UploadModule],
  providers: [UsersService],
  controllers: [UsersController, AdminUsersController],
  exports: [UsersService],
})
export class UsersModule { }
