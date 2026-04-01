import { Controller, Get, Post, Body, Patch, Param, Delete, Req, Request, Query } from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/passport/jwt-auth.guard';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  create(@Body() createChatDto: CreateChatDto) {
    return this.chatService.create(createChatDto);
  }

  // cho cái nút chat ngay trong trang chi tiết sản phẩm hoặc là chi tiết cửa hàng 
  @Post("start-chat")
  @UseGuards(JwtAuthGuard)
  startChat(@Request() req, @Body() body: { shopId: number }) {
    const userId = req.user.userId;

    return this.chatService.createConversationFromShop(
      userId,
      Number(body.shopId)
    );
  }

  // lấy ra danh sách cuộc trò chuyện
  @Get("list-conversations")
  @UseGuards(JwtAuthGuard)
  getConversations(@Request() req) {
    const userId = req.user.userId;

    return this.chatService.getUserConversations(userId);
  }

  // lấy ra cuộc trò chuyện của userID gọi khi nhấn vào các cái cuộc trò chuyên trong danh sách
  @Get("messages/:conversationId")
  @UseGuards(JwtAuthGuard)
  getMessages(@Request() req, @Param("conversationId") conversationId: string , @Query("cursor") cursor?: number , @Query("limit") limit?: number) {
    return this.chatService.getMessages(
      req.user.userId,
      Number(conversationId),
      cursor ? Number(cursor) : undefined,
      limit ? Number(limit) : 20,
    );
  }

  @Get()
  findAll() {
    return this.chatService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.chatService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateChatDto: UpdateChatDto) {
    return this.chatService.update(+id, updateChatDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.chatService.remove(+id);
  }
}
