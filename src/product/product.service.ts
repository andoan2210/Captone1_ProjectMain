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

  private parseImageIds(rawImageIds?: string): number[] {
    if (
      rawImageIds === undefined ||
      rawImageIds === null ||
      rawImageIds.trim() === ''
    ) {
      return [];
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(rawImageIds);
    } catch (error) {
      throw new BadRequestException(
        'removeImageIds must be a valid JSON array',
      );
    }

    if (!Array.isArray(parsed)) {
      throw new BadRequestException('removeImageIds must be a JSON array');
    }

    const normalizedIds = parsed.map((item, index) => {
      const imageId = Number(item);

      if (!Number.isInteger(imageId) || imageId <= 0) {
        throw new BadRequestException(
          `Image id at index ${index} must be a positive integer`,
        );
      }

      return imageId;
    });

    return [...new Set(normalizedIds)];
  }

  private hasAnyUpdateData(
    updateProductDto: UpdateProductDto,
    files?: {
      thumbnail?: Express.Multer.File[];
      images?: Express.Multer.File[];
    },
  ): boolean {
    const hasBodyData =
      updateProductDto.productName !== undefined ||
      updateProductDto.categoryId !== undefined ||
      updateProductDto.description !== undefined ||
      updateProductDto.isActive !== undefined ||
      updateProductDto.variants !== undefined ||
      updateProductDto.removeImageIds !== undefined;

    const hasThumbnail = !!files?.thumbnail?.[0];
    const hasNewImages = (files?.images?.length ?? 0) > 0;

    return hasBodyData || hasThumbnail || hasNewImages;
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

      await this.redis.deleteByPattern(`product:category:${createdProduct.CategoryId}:*`);

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

      await this.redis.set(cacheKey, JSON.stringify(result), 60 * 1);
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

  async getMyProducts(ownerUserId: number, page : number , limit :number) {
    try {
      const skip = (page - 1) * limit;
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

      const products = await this.prisma.products.findMany({
        where: {
          StoreId: store.StoreId,
          IsDeleted: false,
        },
        skip,
        take: limit,
        orderBy: {
          UpdatedAt: 'desc',
        },
        select: {
          ProductId: true,
          ProductName: true,
          Price: true,
          ThumbnailUrl: true,
          IsActive: true,
          UpdatedAt: true,
          CreatedAt: true,
          Categories: {
            select: {
              CategoryId: true,
              CategoryName: true,
            },
          },
          ProductVariants: {
            select: {
              Stock: true,
            },
          },
        },
      });

      const result = products.map((product) => {
        const totalStock = product.ProductVariants.reduce(
          (sum, variant) => sum + (variant.Stock ?? 0),
          0,
        );

        return {
          productId: product.ProductId,
          productName: product.ProductName,
          price: Number(product.Price),
          thumbnailUrl: product.ThumbnailUrl,
          stock: totalStock,
          isActive: product.IsActive ?? false,
          updatedAt: product.UpdatedAt,
          createdAt: product.CreatedAt,
          category: product.Categories
            ? {
                categoryId: product.Categories.CategoryId,
                categoryName: product.Categories.CategoryName,
              }
            : null,
        };
      });

      return {
        message: 'Get my products successfully',
        data: result,
      };
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

  async update(
    ownerUserId: number,
    id: number,
    updateProductDto: UpdateProductDto,
    files: {
      thumbnail?: Express.Multer.File[];
      images?: Express.Multer.File[];
    },
  ) {
    const uploadedFileUrls: string[] = [];
    const oldFileUrlsToDeleteAfterSuccess: string[] = [];

    try {
      if (!this.hasAnyUpdateData(updateProductDto, files)) {
        throw new BadRequestException('No data provided to update');
      }

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
          ProductId: id,
          StoreId: store.StoreId,
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
          UpdatedAt: true,
          ProductImages: {
            select: {
              ImageId: true,
              ImageUrl: true,
            },
            orderBy: {
              ImageId: 'asc',
            },
          },
          ProductVariants: {
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
          },
        },
      });

      if (!existingProduct) {
        throw new NotFoundException('Product not found');
      }

      if (updateProductDto.categoryId !== undefined) {
        const category = await this.prisma.categories.findFirst({
          where: {
            CategoryId: updateProductDto.categoryId,
            IsActive: true,
          },
          select: {
            CategoryId: true,
          },
        });

        if (!category) {
          throw new NotFoundException('Category not found');
        }
      }

      const parsedVariants =
        updateProductDto.variants !== undefined
          ? this.parseVariants(updateProductDto.variants)
          : null;

      const removeImageIds = this.parseImageIds(updateProductDto.removeImageIds);

      const removableImages =
        removeImageIds.length > 0
          ? existingProduct.ProductImages.filter((image) =>
              removeImageIds.includes(image.ImageId),
            )
          : [];

      if (
        removeImageIds.length > 0 &&
        removableImages.length !== removeImageIds.length
      ) {
        throw new BadRequestException(
          'One or more images do not belong to this product',
        );
      }

      const thumbnailFile = files?.thumbnail?.[0];
      const newImageFiles = files?.images ?? [];

      let newThumbnailUrl: string | null = null;
      if (thumbnailFile) {
        newThumbnailUrl = await this.uploadService.uploadImage(
          thumbnailFile,
          'products/thumbnail',
        );
        uploadedFileUrls.push(newThumbnailUrl);
      }

      const newImageUrls =
        newImageFiles.length > 0
          ? await this.uploadService.uploadMultipleImages(
              newImageFiles,
              'products/images',
            )
          : [];

      uploadedFileUrls.push(...newImageUrls);

      const productData: {
        CategoryId?: number;
        ProductName?: string;
        Description?: string | null;
        IsActive?: boolean;
        ThumbnailUrl?: string;
        Price?: number;
      } = {};

      if (updateProductDto.categoryId !== undefined) {
        productData.CategoryId = updateProductDto.categoryId;
      }

      if (updateProductDto.productName !== undefined) {
        productData.ProductName = updateProductDto.productName.trim();
      }

      if (updateProductDto.description !== undefined) {
        productData.Description = updateProductDto.description?.trim() || null;
      }

      if (updateProductDto.isActive !== undefined) {
        productData.IsActive = updateProductDto.isActive;
      }

      if (newThumbnailUrl) {
        productData.ThumbnailUrl = newThumbnailUrl;
      }

      if (parsedVariants) {
        productData.Price = Math.min(...parsedVariants.map((item) => item.price));
      }

      const updatedProduct = await this.prisma.$transaction(async (tx) => {
        const product = await tx.products.update({
          where: {
            ProductId: existingProduct.ProductId,
          },
          data: productData,
          select: {
            ProductId: true,
            StoreId: true,
            CategoryId: true,
            ProductName: true,
            Description: true,
            Price: true,
            ThumbnailUrl: true,
            IsActive: true,
            UpdatedAt: true,
          },
        });

        if (parsedVariants) {
          await tx.productVariants.deleteMany({
            where: {
              ProductId: existingProduct.ProductId,
            },
          });

          await tx.productVariants.createMany({
            data: parsedVariants.map((variant) => ({
              ProductId: existingProduct.ProductId,
              Size: variant.size,
              Color: variant.color,
              Stock: variant.stock,
              Price: variant.price,
            })),
          });
        }

        if (removeImageIds.length > 0) {
          await tx.productImages.deleteMany({
            where: {
              ProductId: existingProduct.ProductId,
              ImageId: {
                in: removeImageIds,
              },
            },
          });
        }

        if (newImageUrls.length > 0) {
          await tx.productImages.createMany({
            data: newImageUrls.map((url) => ({
              ProductId: existingProduct.ProductId,
              ImageUrl: url,
            })),
          });
        }

        const currentImages = await tx.productImages.findMany({
          where: {
            ProductId: existingProduct.ProductId,
          },
          select: {
            ImageId: true,
            ImageUrl: true,
          },
          orderBy: {
            ImageId: 'asc',
          },
        });

        const currentVariants = await tx.productVariants.findMany({
          where: {
            ProductId: existingProduct.ProductId,
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
          images: currentImages,
          variants: currentVariants,
        };
      });

      if (newThumbnailUrl && existingProduct.ThumbnailUrl) {
        oldFileUrlsToDeleteAfterSuccess.push(existingProduct.ThumbnailUrl);
      }

      if (removableImages.length > 0) {
        oldFileUrlsToDeleteAfterSuccess.push(
          ...removableImages.map((image) => image.ImageUrl),
        );
      }

      for (const fileUrl of oldFileUrlsToDeleteAfterSuccess) {
        try {
          await this.uploadService.deleteFile(fileUrl);
        } catch (cleanupError) {
          this.logger.error(cleanupError);
        }
      }

      this.logger.log(
        `Update product successfully: productId=${updatedProduct.ProductId}, storeId=${updatedProduct.StoreId}`,
      );

      await this.redis.deleteByPattern(`product:category:${updatedProduct.CategoryId}:*`);

      return {
        message: 'Update product successfully',
        data: {
          productId: updatedProduct.ProductId,
          storeId: updatedProduct.StoreId,
          categoryId: updatedProduct.CategoryId,
          productName: updatedProduct.ProductName,
          description: updatedProduct.Description,
          price: updatedProduct.Price,
          thumbnailUrl: updatedProduct.ThumbnailUrl,
          isActive: updatedProduct.IsActive,
          updatedAt: updatedProduct.UpdatedAt,
          images: updatedProduct.images.map((image) => ({
            imageId: image.ImageId,
            imageUrl: image.ImageUrl,
          })),
          variants: updatedProduct.variants.map((variant) => ({
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

  async getDetailProduct(id: number) {
    try {
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
          Description: true,
          Categories: {
            select: { CategoryName: true },
          },
          ProductImages: {
            select: {
              ImageUrl: true,
            },
          },
          ProductVariants: {
            select: {
              VariantId: true,
              Size: true,
              Color: true,
              Stock: true,
              Price: true,
            },
          },
        },
      });

      if (!product) {
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
        description: product.Description,
        thumbnail: product.ThumbnailUrl,
        categoryName: product.Categories?.CategoryName ?? null,
        images: product.ProductImages.map((img) => img.ImageUrl),
        variants: product.ProductVariants.map((variant) => ({
          variantId: variant.VariantId,
          size: variant.Size,
          color: variant.Color,
          stock: variant.Stock,
          price: variant.Price,
        })),
        sold: sold._sum.Quantity || 0,
      };
    } catch (error) {
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
          ThumbnailUrl: true,
          ProductImages :{
            select :{
              ImageId : true,
              ImageUrl : true,
            },
          },
        },
      });

      if (!existingProduct) {
        throw new NotFoundException('Product not found');
      }

      if(existingProduct.ThumbnailUrl){
        this.logger.log(`delete thumbnail ${existingProduct.ThumbnailUrl}`);
        await this.uploadService.deleteFile(existingProduct.ThumbnailUrl);
      }

      for(const image of existingProduct.ProductImages){
        this.logger.log(`delete image ${image.ImageId} : ${image.ImageUrl}`);
        await this.uploadService.deleteFile(image.ImageUrl);
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
  
  async getProductShop(idShop : number,limit :number){
    try {
      const products = await this.prisma.products.findMany({
        where: {
          StoreId: idShop,
          IsActive :true,
          IsDeleted :false,
        },
        take:limit,
        select: {
          ProductId: true,
          ProductName: true,
          Price: true,
          ThumbnailUrl: true,
          Description: true,
          Categories: {
            select: { CategoryName: true },
          },
          ProductImages: {
            select: {
              ImageUrl: true,
            },
          },
          ProductVariants: {
            select: {
              VariantId: true,
              Size: true,
              Color: true,
              Stock: true,
              Price: true,
            },
          },
        },
      });

      this.logger.log(`idShop : ${idShop}`);
      this.logger.log(products);
      return products.map((product) => ({
        id: product.ProductId,
        name: product.ProductName,
        price: product.Price,
        description: product.Description,
        thumbnail: product.ThumbnailUrl,
        categoryName: product.Categories?.CategoryName ?? null,
        images: product.ProductImages.map((img) => img.ImageUrl),
        variants: product.ProductVariants.map((variant) => ({
          variantId: variant.VariantId,
          size: variant.Size,
          color: variant.Color,
          stock: variant.Stock,
          price: variant.Price,
        })),
      }));
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
}