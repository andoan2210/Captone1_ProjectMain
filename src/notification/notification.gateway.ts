import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

interface TokenPayload {
  sub: string;
  email: string;
  role: string;
}

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: 'http://localhost:5173',
    credentials: true,
  },
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  // Xác thực JWT khi client kết nối
  handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token;

      if (!token) throw new Error('No token');

      const user = this.jwtService.verify<TokenPayload>(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      if (!user?.sub) {
        throw new Error('Invalid payload');
      }

      client.data.user = user;

      // Auto join phòng cá nhân để nhận thông báo
      client.join(`notification_user_${user.sub}`);

      console.log(`[NOTIFICATION WS CONNECT] user=${user.sub}`);
    } catch (err: any) {
      console.log('[NOTIFICATION WS ERROR] Auth:', err?.message);

      if (err.name === 'TokenExpiredError') {
        client.emit('error', 'TokenExpired');
      } else {
        client.emit('error', 'Unauthorized');
      }

      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data.user as TokenPayload | undefined;
    console.log(
      `[NOTIFICATION WS DISCONNECT] user=${user?.sub || 'unknown'}`,
    );
  }

  // Gửi thông báo real-time đến user cụ thể
  sendNotificationToUser(userId: number, notification: any) {
    this.server
      .to(`notification_user_${userId}`)
      .emit('newNotification', notification);
    console.log(
      `[NOTIFICATION WS] Sent notification to user=${userId}:`,
      notification.Title,
    );
  }
}
