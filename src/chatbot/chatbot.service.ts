import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI, Content } from '@google/generative-ai';
import { RagService, SuggestedProduct } from './rag.service';
import { RedisService } from 'src/shared/service/redis.service';

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  suggestedProducts?: SuggestedProduct[];
  timestamp: string;
}

export interface ChatResponse {
  answer: string;
  suggestedProducts: SuggestedProduct[];
}

@Injectable()
export class ChatbotService {
  private genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

  // TTL cho lịch sử chat: 24 giờ 
  private readonly CHAT_TTL = 60 * 60 * 24;

  constructor(
    private rag: RagService,
    private readonly redis: RedisService,
  ) {}

   // tạo Redis key cho lịch sử chat của user
  private getChatKey(userId: number): string {
    return `chat:user:${userId}`;
  }

  async ask(
    question: string,
    userId: number,
    conversationHistory: Content[] = [],
  ): Promise<ChatResponse> {
    const { contextText, suggestedProducts } = await this.rag.retrieve(question);

    const systemInstruction = `
        Bạn là trợ lý tư vấn mua sắm thông minh của nền tảng thương mại điện tử thời trang.

        NHIỆM VỤ CỦA BẠN:
        - Giúp khách hàng tìm kiếm sản phẩm phù hợp với nhu cầu và sở thích
        - Tư vấn về kích cỡ, màu sắc, chất liệu và mức giá phù hợp
        - Gợi ý các cửa hàng/shop uy tín có bán sản phẩm mà khách cần
        - Trả lời mọi thắc mắc về sản phẩm một cách thân thiện và chuyên nghiệp
        - Hỗ trợ khách hàng so sánh sản phẩm khi được yêu cầu

        QUY TẮC BẮT BUỘC:
        - Luôn trả lời bằng Tiếng Việt, ngôn ngữ thân thiện và dễ hiểu
        - CHỈ tư vấn dựa trên thông tin sản phẩm có trong hệ thống (được cung cấp ở CONTEXT bên dưới)
        - Nếu không tìm được sản phẩm phù hợp, hãy thông báo thật thà và gợi ý khách tìm theo cách khác
        - Không bịa đặt thông tin về sản phẩm, giá cả, màu sắc hoặc kích cỡ
        - Khi tư vấn sản phẩm, hãy đề cập tên cửa hàng bán sản phẩm đó
        - Trả lời ngắn gọn, xúc tích và dễ đọc (dùng bullet point khi cần)
        - Kết thúc câu trả lời bằng câu hỏi để hiểu thêm nhu cầu khách hàng (nếu phù hợp)

        CONTEXT — THÔNG TIN SẢN PHẨM TRONG HỆ THỐNG:
        ${contextText || 'Không tìm thấy sản phẩm phù hợp với yêu cầu này.'}
    `.trim();

    const model = this.genAI.getGenerativeModel({
      model: 'gemini-flash-latest',
      systemInstruction,
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7,
      },
    });

    const chat = model.startChat({
      history: conversationHistory,
    });

    const result = await chat.sendMessage(question);
    const answer = result.response.text();

    // lưu tin nhắn user và model vào Redis
    const chatKey = this.getChatKey(userId);

    const userMessage: ChatMessage = {
      role: 'user',
      content: question,
      timestamp: new Date().toISOString(),
    };

    const modelMessage: ChatMessage = {
      role: 'model',
      content: answer,
      suggestedProducts,
      timestamp: new Date().toISOString(),
    };

    // lấy tin nhắn cũ (nếu có) rồi thêm tin nhắn mới
    const existing = await this.redis.get(chatKey);
    const messages: ChatMessage[] = existing ? JSON.parse(existing) : [];
    messages.push(userMessage, modelMessage);

    // lưu lại vào Redis với TTL
    await this.redis.set(chatKey, JSON.stringify(messages), this.CHAT_TTL);

    return { answer, suggestedProducts };
  }

  // lấy toàn bộ tin nhắn của user từ Redis
  async getMessages(userId: number): Promise<ChatMessage[]> {
    const chatKey = this.getChatKey(userId);
    const data = await this.redis.get(chatKey);

    if (!data) {
      return [];
    }

    return JSON.parse(data) as ChatMessage[];
  }

}