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
  async create(createCategoryDto: CreateCategoryDto) {
    try {
      const category = await this.prisma.categories.create({
        data: {
          CategoryName: createCategoryDto.CategoryName,
          ParentId: createCategoryDto.ParentId,
          IsActive: true,
        },
      });
      await this.clearCategoryCache();
      return category;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findAll(limit: number) {
    try {
      const safeLimit = Math.min(limit || 50, 100);
      const cacheKey = `category_v2:all:${safeLimit}`;

      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const categories = await this.prisma.categories.findMany({
        take: safeLimit,
        where: { IsActive: true },
        orderBy: { CategoryId: 'asc' },
        include: {
          Categories: true, // Parent
        },
      });

      const result = categories.map((c) => ({
        id: c.CategoryId,
        name: c.CategoryName,
        parentId: c.ParentId,
        parentName: c.Categories?.CategoryName || null,
        IsActive: c.IsActive,
      }));

      await this.redis.set(cacheKey, JSON.stringify(result), 60 * 15);
      return result;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findAllAdmin() {
    try {
      const categories = await this.prisma.categories.findMany({
        orderBy: { CategoryId: 'desc' },
        include: {
          Categories: {
            select: {
              CategoryName: true,
            },
          },
        },
      });

      return categories.map((c) => ({
        id: c.CategoryId,
        name: c.CategoryName,
        parentId: c.ParentId,
        parentName: c.Categories?.CategoryName || null,
        IsActive: c.IsActive,
      }));
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async getCategoryByParent(parentId: number, limit: number) {
    try {
      const safeLimit = Math.min(limit || 50, 100);
      const cacheKey = `category_v2:parent:${parentId}:${safeLimit}`;

      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const categories = await this.prisma.categories.findMany({
        take: safeLimit,
        where: {
          ParentId: parentId,
          IsActive: true,
        },
        orderBy: { CategoryId: 'asc' },
      });

      const result = categories.map((c) => ({
        id: c.CategoryId,
        name: c.CategoryName,
        parentId: c.ParentId,
        IsActive: c.IsActive,
      }));

      await this.redis.set(cacheKey, JSON.stringify(result), 60 * 15);
      return result;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const category = await this.prisma.categories.findUnique({
        where: { CategoryId: id },
        include: {
          Categories: true,
        },
      });
      if (!category) {
        throw new Error('Category not found');
      }
      return {
        id: category.CategoryId,
        name: category.CategoryName,
        parentId: category.ParentId,
        parentName: category.Categories?.CategoryName || null,
        IsActive: category.IsActive,
      };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async update(id: number, updateCategoryDto: UpdateCategoryDto) {
    try {
      const category = await this.prisma.categories.update({
        where: { CategoryId: id },
        data: updateCategoryDto,
      });
      await this.clearCategoryCache();
      return category;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async remove(id: number) {
    try {
      // Soft delete: set IsActive to false
      const category = await this.prisma.categories.update({
        where: { CategoryId: id },
        data: { IsActive: false },
      });
      await this.clearCategoryCache();
      return category;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  private async clearCategoryCache() {
    try {
      await this.redis.deleteByPattern('category_v2:*');
    } catch (error) {
      this.logger.error('Failed to clear category cache', error);
    }
  }
}
