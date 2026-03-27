import { Module } from '@nestjs/common';
import { StoreService } from './store.service';
import { StoreController } from './store.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { UploadModule } from 'src/upload/upload.module';


@Module({
  controllers: [StoreController],
  providers: [StoreService],
})

@Module({
  // Import PrismaModule để StoreService dùng được PrismaService
  imports: [PrismaModule,UploadModule],
  controllers: [StoreController],
  providers: [StoreService],
})

export class StoreModule {}
