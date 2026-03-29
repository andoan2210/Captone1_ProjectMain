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
import { UploadService } from 'src/upload/upload.service';

type ProductVariantInput = {
  size: string;
  color?: string | null;
  stock: number;
  price: number;
};

@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
    private readonly redis: RedisService,
    private readonly uploadService: UploadService,
  ) {}

private parseVariants(rawVariants: string): ProductVariantInput[] {
    let parsed: unknown;

    try {
      parsed = JSON.parse(rawVariants);
    } catch (error) {
      throw new BadRequestException('Variants must be a valid JSON array');
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new BadRequestException('At least one product variant is required');
    }

    const normalizedVariants = parsed.map((item: any, index: number) => {
      const size = typeof item?.size === 'string' ? item.size.trim() : '';
      const color =
        typeof item?.color === 'string' && item.color.trim() !== ''
          ? item.color.trim()
          : null;

      const stock = Number(item?.stock);
      const price = Number(item?.price);

      if (!size) {
        throw new BadRequestException(`Variant at index ${index} must have size`);
      }

      if (size.length > 10) {
        throw new BadRequestException(
          `Variant size at index ${index} exceeds 10 characters`,
        );
      }

      if (color && color.length > 50) {
        throw new BadRequestException(
          `Variant color at index ${index} exceeds 50 characters`,
        );
      }

      if (!Number.isInteger(stock) || stock < 0) {
        throw new BadRequestException(
          `Variant stock at index ${index} must be an integer >= 0`,
        );
      }

      if (!Number.isFinite(price) || price <= 0) {
        throw new BadRequestException(
          `Variant price at index ${index} must be greater than 0`,
        );
      }

      return {
        size,
        color,
        stock,
        price,
      };
    });

    const duplicateChecker = new Set<string>();

    for (const variant of normalizedVariants) {
      const key = `${variant.size.toLowerCase()}::${(variant.color ?? '').toLowerCase()}`;
      if (duplicateChecker.has(key)) {
        throw new BadRequestException(
          `Duplicate variant detected for size "${variant.size}" and color "${variant.color ?? ''}"`,
        );
      }
      duplicateChecker.add(key);
    }

    return normalizedVariants;
  }

  async create(
    ownerUserId: number,
    createProductDto: CreateProductDto,
    files: {
      thumbnail?: Express.Multer.File[];
      images?: Express.Multer.File[];
    },
  ) {
    const uploadedFileUrls: string[] = [];

    try {
      const store = await this.prisma.stores.findFirst({
        where: {
          OwnerId: ownerUserId,
          IsDeleted: false,
        },
        select: {
          StoreId: true,
        },
      });

      if (!store) {
        throw new NotFoundException('Store not found');
      }

      const category = await this.prisma.categories.findFirst({
        where: {
          CategoryId: createProductDto.categoryId,
          IsActive: true,
        },
        select: {
          CategoryId: true,
        },
      });

      if (!category) {
        throw new NotFoundException('Category not found');
      }

      const variants = this.parseVariants(createProductDto.variants);

      const thumbnailFile = files?.thumbnail?.[0];
      const imageFiles = files?.images ?? [];

      if (!thumbnailFile) {
        throw new BadRequestException('Thumbnail image is required');
      }

      const thumbnailUrl = await this.uploadService.uploadImage(
        thumbnailFile,
        'products/thumbnail',
      );
      uploadedFileUrls.push(thumbnailUrl);

      const imageUrls =
        imageFiles.length > 0
          ? await this.uploadService.uploadMultipleImages(
              imageFiles,
              'products/images',
            )
          : [];

      uploadedFileUrls.push(...imageUrls);

      const representativePrice = Math.min(...variants.map((item) => item.price));

      const createdProduct = await this.prisma.$transaction(async (tx) => {
        const product = await tx.products.create({
          data: {
            StoreId: store.StoreId,
            CategoryId: createProductDto.categoryId,
            ProductName: createProductDto.productName.trim(),
            Description: createProductDto.description?.trim() || null,
            Price: representativePrice,
            ThumbnailUrl: thumbnailUrl,
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
            ThumbnailUrl: true,
            IsActive: true,
            CreatedAt: true,
          },
        });

        if (imageUrls.length > 0) {
          await tx.productImages.createMany({
            data: imageUrls.map((url) => ({
              ProductId: product.ProductId,
              ImageUrl: url,
            })),
          });
        }

        await tx.productVariants.createMany({
          data: variants.map((variant) => ({
            ProductId: product.ProductId,
            Size: variant.size,
            Color: variant.color,
            Stock: variant.stock,
            Price: variant.price,
          })),
        });

        const createdImages = await tx.productImages.findMany({
          where: {
            ProductId: product.ProductId,
          },
          select: {
            ImageId: true,
            ImageUrl: true,
          },
          orderBy: {
            ImageId: 'asc',
          },
        });

        const createdVariants = await tx.productVariants.findMany({
          where: {
            ProductId: product.ProductId,
          },
          select: {
            VariantId: true,
            Size: true,
            Color: true,
            Stock: true,
            Price: true,
          },
          orderBy: {
            VariantId: 'asc',
          },
        });

        return {
          ...product,
          images: createdImages,
          variants: createdVariants,
        };
      });

      this.logger.log(
        `Create product successfully: productId=${createdProduct.ProductId}, storeId=${createdProduct.StoreId}`,
      );

      return {
        message: 'Create product successfully',
        data: {
          productId: createdProduct.ProductId,
          storeId: createdProduct.StoreId,
          categoryId: createdProduct.CategoryId,
          productName: createdProduct.ProductName,
          description: createdProduct.Description,
          price: createdProduct.Price,
          thumbnailUrl: createdProduct.ThumbnailUrl,
          isActive: createdProduct.IsActive,
          createdAt: createdProduct.CreatedAt,
          images: createdProduct.images.map((image) => ({
            imageId: image.ImageId,
            imageUrl: image.ImageUrl,
          })),
          variants: createdProduct.variants.map((variant) => ({
            variantId: variant.VariantId,
            size: variant.Size,
            color: variant.Color,
            stock: variant.Stock,
            price: variant.Price,
          })),
        },
      };
    } catch (error) {
      this.logger.error(error);

      if (uploadedFileUrls.length > 0) {
        for (const fileUrl of uploadedFileUrls) {
          try {
            await this.uploadService.deleteFile(fileUrl);
          } catch (cleanupError) {
            this.logger.error(cleanupError);
          }
        }
      }

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
    JOIN ProductVariants pv 
      ON pv.VariantId = oi.VariantId
    JOIN Products p 
      ON p.ProductId = pv.ProductId
      AND p.IsActive = 1 
      AND p.IsDeleted = 0
    LEFT JOIN Categories c 
      ON c.CategoryId = p.CategoryId
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
    const result = products.map(p => ({
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

  async getDetailProduct(id: number) {
    try{
      const product = await this.prisma.products.findFirst({
        where: {
          ProductId: id,
          IsActive: true,
          IsDeleted: false,
        },
        select: {
          ProductId: true,
          ProductName: true,
          Price: true,
          ThumbnailUrl: true,
          Description :true,
          Categories: {
            select: { CategoryName: true },
          },
          ProductImages: {
            select : {
              ImageUrl : true,
            }
          },
          ProductVariants : {
            select : {
              VariantId : true,
              Size : true,
              Color : true,
              Stock : true,
              Price : true,
            }
          },
        },
      });

      if(!product){
        this.logger.error('Product not found');
        return null;
      }

      const sold = await this.prisma.orderItems.aggregate({
          _sum: {
            Quantity: true,
          },
          where: {
            ProductVariants: {
              ProductId: id,
            },
          },
      });

      this.logger.log(product);
      return {
        id: product.ProductId,
        name: product.ProductName,
        price: product.Price,
        thumbnail: product.ThumbnailUrl,
        categoryName: product.Categories?.CategoryName ?? null,
        images: product.ProductImages.map(img => img.ImageUrl),
        variants: product.ProductVariants.map(variant => ({
          variantId: variant.VariantId,
          size: variant.Size,
          color: variant.Color,
          stock: variant.Stock,
          price: variant.Price,
        })),
        sold: sold._sum.Quantity || 0,
      };
    }catch(error){
      this.logger.error(error);
      throw error;
    }
  }

  async remove(ownerUserId: number, productId: number) {
    try {
      const store = await this.prisma.stores.findFirst({
        where: {
          OwnerId: ownerUserId,
          IsDeleted: false,
        },
        select: {
          StoreId: true,
        },
      });

      if (!store) {
        throw new NotFoundException('Store not found');
      }

      const existingProduct = await this.prisma.products.findFirst({
        where: {
          ProductId: productId,
          StoreId: store.StoreId,
          IsDeleted: false,
        },
        select: {
          ProductId: true,
          ProductName: true,
          StoreId: true,
        },
      });

      if (!existingProduct) {
        throw new NotFoundException('Product not found');
      }

      const deletedProduct = await this.prisma.products.update({
        where: {
          ProductId: existingProduct.ProductId,
        },
        data: {
          IsDeleted: true,
          IsActive: false,
        },
        select: {
          ProductId: true,
          ProductName: true,
          StoreId: true,
          IsActive: true,
          IsDeleted: true,
          UpdatedAt: true,
        },
      });

      this.logger.log(
        `Delete product successfully: productId=${deletedProduct.ProductId}, storeId=${deletedProduct.StoreId}`,
      );

      return {
        message: 'Delete product successfully',
        data: {
          productId: deletedProduct.ProductId,
          productName: deletedProduct.ProductName,
          storeId: deletedProduct.StoreId,
          isActive: deletedProduct.IsActive,
          isDeleted: deletedProduct.IsDeleted,
          updatedAt: deletedProduct.UpdatedAt,
        },
      };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
}