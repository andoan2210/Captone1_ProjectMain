import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationGateway } from './notification.gateway';

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  /**
   * Tạo notification lưu DB + gửi real-time qua WebSocket
   */
  async createNotification(userId: number, title: string, content: string) {
    const notification = await this.prisma.notifications.create({
      data: {
        UserId: userId,
        Title: title,
        Content: content,
        IsRead: false,
      },
    });

    // Gửi thông báo real-time qua WebSocket
    this.notificationGateway.sendNotificationToUser(userId, notification);

    return notification;
  }

  /**
   * Lấy danh sách thông báo của user (phân trang cursor-based, mới nhất trước)
   */
  async getNotifications(userId: number, cursor?: number, limit: number = 20) {
    limit = Math.min(limit, 50);

    const notifications = await this.prisma.notifications.findMany({
      where: { UserId: userId },
      orderBy: { CreatedAt: 'desc' },
      take: limit,
      ...(cursor && {
        cursor: { NotificationId: cursor },
        skip: 1,
      }),
    });

    const nextCursor = notifications.length
      ? notifications[notifications.length - 1].NotificationId
      : null;

    return {
      data: notifications,
      nextCursor,
    };
  }

  /**
   * Đếm số thông báo chưa đọc
   */
  async getUnreadCount(userId: number) {
    const count = await this.prisma.notifications.count({
      where: {
        UserId: userId,
        IsRead: false,
      },
    });

    return { unreadCount: count };
  }

  /**
   * Đánh dấu 1 thông báo đã đọc
   */
  async markAsRead(notificationId: number, userId: number) {
    const notification = await this.prisma.notifications.updateMany({
      where: {
        NotificationId: notificationId,
        UserId: userId,
      },
      data: {
        IsRead: true,
      },
    });

    return { message: 'Đã đánh dấu đã đọc', updated: notification.count };
  }

  /**
   * Đánh dấu tất cả thông báo đã đọc
   */
  async markAllAsRead(userId: number) {
    const result = await this.prisma.notifications.updateMany({
      where: {
        UserId: userId,
        IsRead: false,
      },
      data: {
        IsRead: true,
      },
    });

    return { message: 'Đã đánh dấu tất cả đã đọc', updated: result.count };
  }

  /**
   * Xóa 1 thông báo
   */
  async deleteNotification(notificationId: number, userId: number) {
    const result = await this.prisma.notifications.deleteMany({
      where: {
        NotificationId: notificationId,
        UserId: userId,
      },
    });

    return { message: 'Đã xóa thông báo', deleted: result.count };
  }
}
