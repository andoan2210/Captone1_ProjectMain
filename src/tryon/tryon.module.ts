import { Module } from '@nestjs/common';
import { TryonService } from './tryon.service';
import { TryonController } from './tryon.controller';
import { FashnProvider } from './fashn.provider';
import { UploadModule } from 'src/upload/upload.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { UserThrottlerGuard } from 'src/common/guards/user-throttler.guard';

@Module({
  controllers: [TryonController],
  providers: [TryonService, FashnProvider, UserThrottlerGuard],
  imports: [UploadModule, PrismaModule],
})
export class TryonModule {}
