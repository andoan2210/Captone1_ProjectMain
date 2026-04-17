import { Pinecone } from '@pinecone-database/pinecone';
import { Injectable } from '@nestjs/common';

@Injectable()
export class PineconeService {
  private index;

  constructor() {
    const pc = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });

    this.index = pc.index(process.env.PINECONE_INDEX!);
  }

  async upsert(id: string, vector: number[], metadata: any) {
    if (!vector || vector.length === 0) return;
    
    await this.index.upsert({
      records: [
        {
          id,
          values: vector,
          metadata,
        },
      ],
    });
  }

  async query(vector: number[]) {
    const res = await this.index.query({
      vector,
      topK: 3,
      includeMetadata: true,
    });

    return res.matches;
  }

  async deleteRecord(id: string) {
    await this.index.deleteOne(id);
  }

  async deleteAll() {
    await this.index.deleteAll();
  }
}