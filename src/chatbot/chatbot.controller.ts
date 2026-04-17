import { Body, Controller, Post, Get, Delete, Req, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/passport/jwt-auth.guard';
import { ChatbotService } from './chatbot.service';
import { IngestionService } from './ingestion.service';
import { ChatRequestDto } from './dto/chat-request-chatbot.dto';

@Controller('chatbot')
export class ChatbotController {
  constructor(
    private readonly chatbotService: ChatbotService,
    private readonly ingestionService: IngestionService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('chat')
  async chat(@Request() req, @Body() body: ChatRequestDto) {
    const userId = req.user.userId;
    console.log('Chat endpoint hit with question:', body.question, 'userId:', userId);
    try {
      return await this.chatbotService.ask(
        body.question,
        userId,
        body.conversationHistory ?? [],
      );
    } catch (e) {
      console.log('--- ERROR IN CHAT ---', e);
      return { errorDev: e.message || String(e), stack: e.stack };
    }
  }

  // Lấy lịch sử tin nhắn của user hiện tại
  @UseGuards(JwtAuthGuard)
  @Get('messages')
  async getMessages(@Request() req) {
    const userId = req.user.userId;
    return this.chatbotService.getMessages(userId);
  }


  @Post('ingest')
  async ingest() {
    return this.ingestionService.indexProducts();
  }

  @Delete('ingest/:id')
  async deleteIngest(@Body('id') id: number) {
    return this.ingestionService.removeProduct(id);
  }

  // Endpoint để dọn dẹp sạch sẽ toàn bộ database Vector (Pinecone)
  @Delete('ingest')
  async deleteAllIngest() {
    return this.ingestionService.removeAllProducts();
  }
}
