import { Injectable } from '@nestjs/common';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Logger } from 'nestjs-pino';
import { RedisService } from 'src/shared/service/redis.service';

@Injectable()
export class StoreService {
  constructor(private readonly prisma : PrismaService,
    private readonly logger : Logger,
    private readonly redis : RedisService
  ){}
  create(createStoreDto: CreateStoreDto) {
    return 'This action adds a new store';
  }

  findAll() {
    return `This action returns all store`;
  }

async getStoreByBest(limit: number) {
  try {
    
    const cacheKey = `store:best:${limit}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      this.logger.log('Store from cache');
      return JSON.parse(cached);
    }

    const stores = await this.prisma.$queryRaw<
      {
        StoreId: number;
        StoreName: string;
        LogoUrl: string;
        Sold: number;
      }[]
    >`
      SELECT TOP (${limit})
        s.StoreId,
        s.StoreName,
        s.LogoUrl,
        ISNULL(SUM(oi.Quantity), 0) as Sold
      FROM Stores s
      LEFT JOIN Products p 
        ON p.StoreId = s.StoreId
        AND p.IsActive = 1
        AND p.IsDeleted = 0
      LEFT JOIN OrderItems oi 
        ON oi.ProductId = p.ProductId
      WHERE s.IsActive = 1
      GROUP BY 
        s.StoreId,
        s.StoreName,
        s.LogoUrl
      ORDER BY Sold DESC
    `;

    const result = stores.map(s => ({
      id: s.StoreId,
      name: s.StoreName,
      logo: s.LogoUrl,
      sold: s.Sold,
    }));

    await this.redis.set(cacheKey, JSON.stringify(result), 60 * 5);

    this.logger.log('Store from DB');

    return result;

    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  findOne(id: number) {
    return `This action returns a #${id} store`;
  }

  update(id: number, updateStoreDto: UpdateStoreDto) {
    return `This action updates a #${id} store`;
  }

  remove(id: number) {
    return `This action removes a #${id} store`;
  }
}
