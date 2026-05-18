import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from 'src/auth/passport/jwt-auth.guard';

@Controller('notification')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  // GET /api/notification?cursor=10&limit=20
  @Get()
  @UseGuards(JwtAuthGuard)
  getNotifications(
    @Request() req,
    @Query('cursor') cursor?: number,
    @Query('limit') limit?: number,
  ) {
    return this.notificationService.getNotifications(
      req.user.userId,
      cursor ? Number(cursor) : undefined,
      limit ? Number(limit) : 20,
    );
  }

  // GET /api/notification/unread-count
  @Get('unread-count')
  @UseGuards(JwtAuthGuard)
  getUnreadCount(@Request() req) {
    return this.notificationService.getUnreadCount(req.user.userId);
  }

  // PATCH /api/notification/read-all
  @Patch('read-all')
  @UseGuards(JwtAuthGuard)
  markAllAsRead(@Request() req) {
    return this.notificationService.markAllAsRead(req.user.userId);
  }

  // PATCH /api/notification/:id/read
  @Patch(':id/read')
  @UseGuards(JwtAuthGuard)
  markAsRead(@Request() req, @Param('id') id: string) {
    return this.notificationService.markAsRead(Number(id), req.user.userId);
  }

  // DELETE /api/notification/:id
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  deleteNotification(@Request() req, @Param('id') id: string) {
    return this.notificationService.deleteNotification(
      Number(id),
      req.user.userId,
    );
  }
}
