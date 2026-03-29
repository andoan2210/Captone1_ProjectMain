import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
} from "@nestjs/websockets";
import { Socket } from "socket.io";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { ChatService } from "./chat.service";

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
}

@WebSocketGateway({
  cors: {
    origin: "http://localhost:5173",
    credentials: true,
  },
})
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
  ) {}

  // HANDLE CONNECT
  handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token;

      if (!token) throw new Error("No token");

      const user = this.jwtService.verify<TokenPayload>(token, {
        secret: this.configService.get<string>("JWT_SECRET"),
      });

      // validate payload
      if (!user?.sub) {
        throw new Error("Invalid payload");
      }

      client.data.user = user;

      console.log(`[WS CONNECT] user=${user.sub}`);
    } catch (err: any) {
      console.log("[WS ERROR] Auth:", err?.message);

      if (err.name === "TokenExpiredError") {
        client.emit("error", "TokenExpired");
      } else {
        client.emit("error", "Unauthorized");
      }

      client.disconnect();
    }
  }

  @SubscribeMessage("joinConversation")
    async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: number }
  ) {
    const user = client.data.user;

    if (!user) return;

    // check user co trong conver ko
    const isValid = await this.chatService.isUserInConversation(
        Number(user.sub),
        data.conversationId
    );

    if (!isValid) {
        client.emit("error", "Forbidden");
        return;
    }

    client.join(`conversation_${data.conversationId}`);

    console.log(
    `[WS] user ${user.sub} joined conversation ${data.conversationId}`
    );
  }

  // handle dis
  handleDisconnect(client: Socket) {
    const user = client.data.user as TokenPayload | undefined;
    console.log(`[WS DISCONNECT] user=${user?.sub || "unknown"}`);
  }

  // handle nhan tin
    @SubscribeMessage("message")
    async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: number; content: string }
    ) {
        try{
            const user = client.data.user;

            if (!user) return;

            if (!data.content || typeof data.content !== "string") return;

            if (data.content.length > 1000) return;

            const message = await this.chatService.createMessage({
                conversationId: data.conversationId,
                senderId: Number(user.sub),
                content: data.content,
            });

            // emit cho room
            const room = `conversation_${data.conversationId}`;
            console.log(message);
            client.to(room).emit("message", message);
            client.emit("message", message);
        }catch(error){
            client.emit("error", "InternalError");
            console.log(error);
        }
    }
}

