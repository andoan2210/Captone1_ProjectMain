import { Controller, Post, Get, Body, UseInterceptors, UploadedFile, Request, UseGuards, Query } from '@nestjs/common';
import { TryonService } from './tryon.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/auth/passport/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { UserThrottlerGuard } from 'src/common/guards/user-throttler.guard';

@Controller('tryon')
export class TryonController {
  constructor(private readonly tryonService: TryonService) {}

  @Post('try')
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  @Throttle({ default: { ttl: 86400000, limit: 2 } })  // 2 lần / ngày mỗi user
  @UseInterceptors(FileInterceptor('file'))
  async tryon(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
    @Body('productId') productId: number,
  ) {
    return this.tryonService.tryon(req.user.userId, file, productId);
  }

  @Get('history-tryon')
  @UseGuards(JwtAuthGuard)
  async getTryonHistory(
    @Request() req,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.tryonService.getTryonHistory(req.user.userId, +page, +limit);
  }

}
