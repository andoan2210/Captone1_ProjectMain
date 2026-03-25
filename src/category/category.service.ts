import { Injectable } from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Logger } from 'nestjs-pino';
import { RedisService } from 'src/shared/service/redis.service';

@Injectable()
export class CategoryService {
  constructor(private readonly prisma : PrismaService,
    private readonly logger : Logger,
    private readonly redis : RedisService
  ){}
  create(createCategoryDto: CreateCategoryDto) {
    return 'This action adds a new category';
  }

  async findAll(limit: number) {
    try {
      const safeLimit = Math.min(limit || 10, 20);
      const cacheKey = `category:all:${safeLimit}`;

      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.log('Category from cache');
        return JSON.parse(cached);
      }

      const categories = await this.prisma.categories.findMany({
        take: safeLimit,
        where: {
          IsActive: true,
        },
        orderBy: {
          CategoryId: 'asc',
        },
        select: {
          CategoryId: true,
          CategoryName: true,
          ParentId: true,
        },
      });

      const result = categories.map(c => ({
        id: c.CategoryId,
        name: c.CategoryName,
        parentId: c.ParentId,
      }));

      await this.redis.set(cacheKey, JSON.stringify(result), 60 * 15);

      this.logger.log('Category from DB');
      return result;

    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async getCategoryByParent(parentId: number, limit: number) {
    try {
      const safeLimit = Math.min(limit || 10, 20);
      const cacheKey = `category:parent:${parentId}:${safeLimit}`;

      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.log('Category from cache');
        return JSON.parse(cached);
      }

      const categories = await this.prisma.categories.findMany({
        take: safeLimit,
        where: {
          ParentId: parentId,
          IsActive: true,
        },
        orderBy: {
          CategoryId: 'asc',
        },
        select: {
          CategoryId: true,
          CategoryName: true,
          ParentId: true,
        },
      });

      const result = categories.map(c => ({
        id: c.CategoryId,
        name: c.CategoryName,
        parentId: c.ParentId,
      }));

      await this.redis.set(cacheKey, JSON.stringify(result), 60 * 15);
      this.logger.log('Category from DB');
      return result;

    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  findOne(id: number) {
    return `This action returns a #${id} category`;
  }

  update(id: number, updateCategoryDto: UpdateCategoryDto) {
    return `This action updates a #${id} category`;
  }

  remove(id: number) {
    return `This action removes a #${id} category`;
  }
}
