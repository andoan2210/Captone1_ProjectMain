import { Module, forwardRef } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { MailModule } from '../mail/mail.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [forwardRef(() => MailModule),UploadModule],
  providers: [UsersService],
  controllers: [UsersController], 
  exports: [UsersService],
})
export class UsersModule {}
