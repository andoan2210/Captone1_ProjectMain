import { Injectable } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { PineconeService } from './pinecone.service';

export interface SuggestedProduct {
  productId: number;
  productName: string;
  price: number;
  thumbnailUrl: string | null;
  storeName: string | null;
  storeId: number | null;
  categoryName: string | null;
  score: number;
}

export interface RagResult {
  contextText: string;
  suggestedProducts: SuggestedProduct[];
}

@Injectable()
export class RagService {
  constructor(
    private embedding: EmbeddingService,
    private pinecone: PineconeService,
  ) {}

  async retrieve(question: string): Promise<RagResult> {
    const vector = await this.embedding.embed(question);
    const results = await this.pinecone.query(vector);

    const contextText = results
      .map((r) => r.metadata?.text)
      .filter(Boolean)
      .join('\n\n---\n\n');

    const suggestedProducts: SuggestedProduct[] = results
      .filter((r) => r.metadata?.productId)
      .map((r) => ({
        productId: r.metadata!.productId as number,
        productName: r.metadata!.productName as string,
        price: r.metadata!.price as number,
        thumbnailUrl: (r.metadata!.thumbnailUrl as string) ?? null,
        storeName: (r.metadata!.storeName as string) ?? null,
        storeId: (r.metadata!.storeId as number) ?? null,
        categoryName: (r.metadata!.categoryName as string) ?? null,
        score: r.score ?? 0,
      }));

    return { contextText, suggestedProducts };
  }
}