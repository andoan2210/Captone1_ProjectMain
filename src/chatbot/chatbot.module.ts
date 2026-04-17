import { Module } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { ChatbotController } from './chatbot.controller';
import { EmbeddingService } from './embedding.service';
import { PineconeService } from './pinecone.service';
import { RagService } from './rag.service';
import { IngestionService } from './ingestion.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ChatbotController],
  providers: [
    ChatbotService,
    EmbeddingService,
    PineconeService,
    RagService,
    IngestionService,
  ],
})
export class ChatbotModule {}
