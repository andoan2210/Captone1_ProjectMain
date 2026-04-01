import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Logger } from 'nestjs-pino';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService,
               private readonly logger: Logger) {}


  async isUserInConversation(userId: number, conversationId: number) {
    const check = await this.prisma.conversations.findFirst({
      where: {
        ConversationId: conversationId,
        OR: [
          { ClientId: userId },
            { ShopOwnerId: userId },
          ],
      },
    });

    return !!check;
  }
  
  async createConversationFromShop(clientId: number, shopId: number) {
    try{
      const store = await this.prisma.stores.findUnique({
        where: { StoreId: shopId },
      });

      if (!store) throw new Error("Store not found");
      this.logger.log(`Store found: ${store.StoreId}`);
      this.logger.log(`Client found: ${clientId}`);
      this.logger.log(`ShopOwner found: ${store.OwnerId}`);
      return this.createConversation(clientId, store.OwnerId);
    }
    catch(error){
      this.logger.error(error);
      throw error;  
    }
  }

  async createConversation(clientId: number, shopOwnerId: number) {
    try{
      const exist = await this.prisma.conversations.findFirst({
        where: {
          ClientId: clientId,
          ShopOwnerId: shopOwnerId,
        },
      });

    
    if (exist) return exist;
    this.logger.log(`Creating conversation for client ${clientId} and shop owner ${shopOwnerId}`);
    return this.prisma.conversations.create({
      data: {
        ClientId: clientId,
        ShopOwnerId: shopOwnerId,
      },
    });
    }catch(error){
      this.logger.error(error);
      throw error;  
    }

  }
  
  async createMessage(data: {
    conversationId: number;
    senderId: number;
    content: string;
  }) {
    try {
      this.logger.log(`Creating message for conversation ${data.conversationId}`);
      this.logger.log(`Sender found: ${data.senderId}`);
      this.logger.log(`Content found: ${data.content}`);  
      return this.prisma.messages.create({
        data: {
          ConversationId: data.conversationId,
          SenderId: data.senderId,
          MessageContent: data.content,
        },
      });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
  
  // lấy lịch sử chat
  async getMessages(userId: number, conversationId: number , cursor? :number , limit:number = 20) {
    try{
      const isValid = await this.isUserInConversation(userId, conversationId);

      if (!isValid) throw new Error("Forbidden");


      limit = Math.min(limit, 50);
      
      this.logger.log(`Cursor found: ${cursor}`);
      this.logger.log(`Limit found: ${limit}`);
      this.logger.log(`Getting messages for conversation ${conversationId}`);
      const messages = await this.prisma.messages.findMany({
        where: { ConversationId: conversationId },
        orderBy: { SentAt: "desc" },
        take:limit,
        ...(cursor && { cursor: { MessageId: cursor }, skip :1, }),
    });

    // lay ra tin nhan cu tiep theo
    const nextCursor = messages.length
      ? messages[messages.length - 1].MessageId
    : null;

    // hien thi tu cu den moi
    const reversed =  messages.reverse();
    return {
      data : reversed,
      nextCursor: nextCursor,
    }

    }catch(error){
      this.logger.error(error);
      throw error;
    }

  }

  // Lấy danh sách conversation của user
  async getUserConversations(userId: number) {
    try {
      this.logger.log(`Getting conversations for user ${userId}`);
      return await this.prisma.conversations.findMany({
        where: {
          OR: [
            { ClientId: userId },
            { ShopOwnerId: userId },
          ],
        },
        include: {
          Messages: {
            orderBy: { SentAt: "desc" },
            take: 1,
          },
          //shop
          Users_Conversations_ShopOwnerIdToUsers: {
            select: {
              UserId: true,
              Stores: {
                select: {
                  StoreId: true,
                  StoreName: true,
                  LogoUrl: true,
                },
              },
            },
          },

      //  khach
          Users_Conversations_ClientIdToUsers: {
              select: {
                UserId: true,
                FullName: true,
                AvatarUrl: true,
              },
            },  
        },
        orderBy: {
          CreatedAt: "desc",
        },
      });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  create(createChatDto: CreateChatDto) {
    return 'This action adds a new chat';
  }

  findAll() {
    return `This action returns all chat`;
  }

  findOne(id: number) {
    return `This action returns a #${id} chat`;
  }

  update(id: number, updateChatDto: UpdateChatDto) {
    return `This action updates a #${id} chat`;
  }

  remove(id: number) {
    return `This action removes a #${id} chat`;
  }
}
