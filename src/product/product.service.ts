import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Logger } from 'nestjs-pino';
import { RedisService } from 'src/shared/service/redis.service';

@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
    private readonly redis: RedisService,
  ) {}

  async create(ownerUserId: number, createProductDto: CreateProductDto) {
    try {
      const store = await this.prisma.stores.findFirst({
        where: {
          OwnerId: ownerUserId,
          IsDeleted: false,
        },
        select: {
          StoreId: true,
          IsActive: true,
        },
      });

      if (!store) {
        throw new NotFoundException('Store not found');
      }

      if (!store.IsActive) {
        throw new BadRequestException('Store is inactive');
      }

      const category = await this.prisma.categories.findFirst({
        where: {
          CategoryId: createProductDto.categoryId,
          IsActive: true,
        },
        select: {
          CategoryId: true,
          CategoryName: true,
        },
      });

      if (!category) {
        throw new NotFoundException('Category not found');
      }

      const imageUrls = Array.from(
        new Set((createProductDto.imageUrls ?? []).map((item) => item.trim()).filter(Boolean)),
      );

      const product = await this.prisma.$transaction(async (tx) => {
        const createdProduct = await tx.products.create({
          data: {
            StoreId: store.StoreId,
            CategoryId: category.CategoryId,
            ProductName: createProductDto.productName.trim(),
            Description: createProductDto.description?.trim() || null,
            Price: createProductDto.price,
            Stock: createProductDto.stock,
            ThumbnailUrl: createProductDto.thumbnailUrl.trim(),
            IsActive: createProductDto.isActive ?? true,
            IsDeleted: false,
          },
          select: {
            ProductId: true,
            StoreId: true,
            CategoryId: true,
            ProductName: true,
            Description: true,
            Price: true,
            Stock: true,
            ThumbnailUrl: true,
            IsActive: true,
            IsDeleted: true,
            CreatedAt: true,
          },
        });

        if (imageUrls.length > 0) {
          await tx.productImages.createMany({
            data: imageUrls.map((imageUrl) => ({
              ProductId: createdProduct.ProductId,
              ImageUrl: imageUrl,
            })),
          });
        }

        return createdProduct;
      });

      this.logger.log(`Create product successfully for store ${store.StoreId}`);

      return {
        message: 'Create product successfully',
        data: {
          productId: product.ProductId,
          storeId: product.StoreId,
          categoryId: product.CategoryId,
          productName: product.ProductName,
          description: product.Description,
          price: Number(product.Price),
          stock: product.Stock,
          thumbnailUrl: product.ThumbnailUrl,
          imageUrls,
          isActive: product.IsActive,
          isDeleted: product.IsDeleted,
          createdAt: product.CreatedAt,
        },
      };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async getNewProduct(limit: number) {
    try {
      const cacheKey = `product:new:${limit}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.log('Product from cache');
        return JSON.parse(cached);
      }

      const product = await this.prisma.products.findMany({
        take: limit,
        where: {
          IsActive: true,
          IsDeleted: false,
        },
        select: {
          ProductId: true,
          ProductName: true,
          Price: true,
          ThumbnailUrl: true,
          CreatedAt: true,
          Categories: {
            select: {
              CategoryName: true,
            },
          },
        },
        orderBy: {
          CreatedAt: 'desc',
        },
      });
      if (product.length === 0) {
        this.logger.error('Product not found');
        return [];
      }
      this.logger.log(product);
      const result = product.map((p) => ({
        ProductId: p.ProductId,
        ProductName: p.ProductName,
        Price: p.Price,
        ThumbnailUrl: p.ThumbnailUrl,
        CreatedAt: p.CreatedAt,
        CategoryName: p.Categories?.CategoryName ?? null,
      }));

      await this.redis.set(cacheKey, JSON.stringify(result), 60 * 5);
      this.logger.log('Product from DB');

      return result;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async getBestSellerProduct(limit: number) {
    try {
      const cacheKey = `product:best-seller:${limit}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.log('Product from cache');
        return JSON.parse(cached);
      }
      const products = await this.prisma.$queryRaw<
        {
          ProductId: number;
          ProductName: string;
          Price: number;
          ThumbnailUrl: string;
          CreatedAt: Date;
          CategoryName: string;
          Sold: number;
        }[]
      >`
      SELECT TOP (${limit})
        p.ProductId,
        p.ProductName,
        p.Price,
        p.ThumbnailUrl,
        p.CreatedAt,
        c.CategoryName,
        SUM(oi.Quantity) as Sold
      FROM OrderItems oi
      JOIN Products p ON p.ProductId = oi.ProductId AND p.IsActive = 1 AND p.IsDeleted = 0
      LEFT JOIN Categories c ON c.CategoryId = p.CategoryId
      GROUP BY 
        p.ProductId,
        p.ProductName,
        p.Price,
        p.ThumbnailUrl,
        p.CreatedAt,
        c.CategoryName
      ORDER BY Sold DESC
    `;

      if (!products || products.length === 0) {
        this.logger.error('Product not found');
        return [];
      }
      const result = products.map((p) => ({
        id: p.ProductId,
        name: p.ProductName,
        price: p.Price,
        thumbnail: p.ThumbnailUrl,
        categoryName: p.CategoryName,
        sold: p.Sold,
      }));
      this.logger.log(products);
      await this.redis.set(cacheKey, JSON.stringify(result), 60 * 5);
      this.logger.log('Product from DB');
      return result;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async getByCategory(categoryId: number, page: number, limit: number) {
    try {
      const cacheKey = `product:category:${categoryId}:${page}:${limit}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.log('Product from cache');
        return JSON.parse(cached);
      }
      const skip = (page - 1) * limit;

      const products = await this.prisma.products.findMany({
        where: {
          CategoryId: categoryId,
          IsActive: true,
          IsDeleted: false,
        },
        skip,
        take: limit,
        orderBy: {
          CreatedAt: 'desc',
        },
        select: {
          ProductId: true,
          ProductName: true,
          Price: true,
          ThumbnailUrl: true,
          Categories: {
            select: { CategoryName: true },
          },
        },
      });

      const result = products.map((p) => ({
        id: p.ProductId,
        name: p.ProductName,
        price: p.Price,
        thumbnail: p.ThumbnailUrl,
        categoryName: p.Categories?.CategoryName ?? null,
      }));

      await this.redis.set(cacheKey, JSON.stringify(result), 60 * 5);
      this.logger.log('Product from DB');
      return result;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  findAll() {
    return `This action returns all product`;
  }

  findOne(id: number) {
    return `This action returns a #${id} product`;
  }

  update(id: number, updateProductDto: UpdateProductDto) {
    return `This action updates a #${id} product`;
  }

  remove(id: number) {
    return `This action removes a #${id} product`;
  }
}