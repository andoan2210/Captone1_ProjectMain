import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class EmbeddingService {
  private genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

  async embed(text: string): Promise<number[]> {
    const model = this.genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
    const result = await model.embedContent(text);
    return result.embedding.values; // 768 dimensions
  }
}