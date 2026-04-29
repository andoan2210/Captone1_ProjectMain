import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Logger } from 'nestjs-pino';
import { UploadService } from 'src/upload/upload.service';
import { RedisService } from 'src/shared/service/redis.service';
import { SearchProductDto } from './dto/search-product.dto';
import Fuse from 'fuse.js';

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

  private readonly SYNONYMS: Record<string, string[]> = {
    // Nhóm Áo
    'áo': ['áo thun', 'áo sơ mi', 'áo khoác', 'áo phông', 'áo cộc', 't-shirt', 'sơ mi', 'áo len', 'áo gió'],
    'áo nam': ['áo thun nam', 'sơ mi nam', 'áo khoác nam'],
    'áo nữ': ['áo thun nữ', 'sơ mi nữ', 'áo kiểu', 'áo khoác nữ'],
    
    // Nhóm Quần
    'quần': ['quần dài', 'quần ngắn', 'quần tây', 'quần jean', 'quần bò', 'quần short', 'quần lửng'],
    'quần nam': ['quần tây nam', 'quần đùi nam', 'quần jean nam', 'short nam'],
    'quần nữ': ['quần tây nữ', 'quần short nữ'],

    // Nhóm Đầm/Váy (Nữ)
    'đầm': ['váy', 'chân váy', 'đầm xòe', 'đầm dự tiệc', 'dress'],

    // Chi tiết 
    'áo thun': ['áo phông', 't-shirt', 'tshirt'],
    'áo sơ mi': ['sơ mi', 'shirt'],
    'áo khoác': ['jacket', 'coat', 'cardigan', 'áo ấm'],
    'quần dài': ['quần tây', 'trousers', 'quần jean', 'jeans'],
    'quần ngắn': ['quần đùi', 'short', 'quần cộc'],
  };

  private removeAccents(str: string): string {
    if (!str) return '';
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D');
  }

  async buildSearchCache() {
    try {
      this.logger.log('Building product search cache...');
      const products = await this.prisma.products.findMany({
        where: { IsActive: true, IsDeleted: false },
        select: {
          ProductId: true,
          ProductName: true,
          Price: true,
          ThumbnailUrl: true,
          Description: true,
          CreatedAt: true,
          Categories: { select: { CategoryId: true, CategoryName: true } },
          ProductVariants: {
            select: { OrderItems: { select: { Quantity: true } } },
          },
        },
      });

      const cacheData = products.map((p) => {
        let sold = 0;
        p.ProductVariants.forEach((pv) => {
          pv.OrderItems.forEach((oi) => { sold += Number(oi.Quantity || 0); });
        });

        // Smart Tagging: Chỉ gắn tag nếu Tên hoặc Mô tả thực sự liên quan
        let metaTags = "";
        const searchBase = `${p.ProductName} ${p.Description || ""} ${p.Categories?.CategoryName || ""}`.toLowerCase();
        
        for (const [key, syns] of Object.entries(this.SYNONYMS)) {
           if (searchBase.includes(key.toLowerCase()) || syns.some(s => searchBase.includes(s.toLowerCase()))) {
               metaTags += ` ${key} ${syns.join(' ')}`;
           }
        }
        
        const finalMetaTags = `${metaTags} ${this.removeAccents(metaTags)}`;

        return {
          id: p.ProductId,
          name: p.ProductName,
          price: Number(p.Price),
          thumbnail: p.ThumbnailUrl,
          description: p.Description,
          categoryId: p.Categories?.CategoryId,
          categoryName: p.Categories?.CategoryName,
          createdAt: new Date(p.CreatedAt || Date.now()).getTime(),
          sold,
          metaTags: finalMetaTags     
        };
      });

      await this.redis.set('global:product_search_cache', JSON.stringify(cacheData), 60 * 60 * 24);
      this.logger.log(`Built search cache for ${cacheData.length} products`);
      return cacheData;
    } catch (e) {
      this.logger.error('Failed to build search cache', e);
      return [];
    }
  }

  private async getSearchSpace() {
    const cached = await this.redis.get('global:product_search_cache');
    if (cached) return JSON.parse(cached);
    return await this.buildSearchCache();
  }

  async getSuggestions(keyword: string) {
    if (!keyword || keyword.trim() === '') return [];
    const data = await this.getSearchSpace();
    const fuse = new Fuse<any>(data, {
      keys: [
        { name: 'name', weight: 0.9 },
        { name: 'metaTags', weight: 0.1 }
      ],
      threshold: 0.25,
      ignoreLocation: true,
    });

    const results = fuse.search(keyword).slice(0, 5);
    return results.map(r => r.item.name);
  }

  async searchProducts(searchDto: SearchProductDto) {
    const { keyword, categoryId, minPrice, maxPrice, sortBy = 'relevance', page = 1, limit = 20 } = searchDto;
    
    let data = await this.getSearchSpace();
    
    if (keyword && keyword.trim() !== '') {
      const fuse = new Fuse<any>(data, {
        keys: [
            { name: 'name', weight: 0.7 },
            { name: 'description', weight: 0.2 },
            { name: 'metaTags', weight: 0.1 }
        ],
        threshold: 0.25, 
        ignoreLocation: true,
      });
      const results = fuse.search(keyword);
      data = results.map(r => r.item);
    }

    if (categoryId) data = data.filter((p: any) => p.categoryId === Number(categoryId));
    if (minPrice !== undefined) data = data.filter((p: any) => p.price >= Number(minPrice));
    if (maxPrice !== undefined) data = data.filter((p: any) => p.price <= Number(maxPrice));

    if (sortBy !== 'relevance' || !keyword) {
      data.sort((a: any, b: any) => {
        if (sortBy === 'sales') return b.sold - a.sold;
        if (sortBy === 'price-asc') return a.price - b.price;
        if (sortBy === 'price-desc') return b.price - a.price;
        if (sortBy === 'ctime') return b.createdAt - a.createdAt;
        return b.createdAt - a.createdAt; 
      });
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;
    const paginatedItems = data.slice(skip, skip + limitNum);

    const returnData = paginatedItems.map((p: any) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      thumbnail: p.thumbnail,
      categoryName: p.categoryName,
      sold: p.sold
    }));

    return {
      message: 'Search products successfully',
      data: returnData,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalItems: data.length,
        totalPages: Math.ceil(data.length / limitNum),
      }
    };
  }

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

// API POST /product
// Dùng để shopowner tạo sản phẩm mới cho shop của mình.
// Sản phẩm mới tạo sẽ mặc định ở trạng thái PENDING để chờ admin duyệt,
// nên chưa được hiển thị ra danh sách public.
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

            // Approval flow: sản phẩm mới tạo phải chờ admin duyệt
            ApprovalStatus: 'PENDING',
            RejectReason: null,
            ReviewedBy: null,
            ReviewedAt: null,
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
            ApprovalStatus: true,
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
      await this.redis.del('global:product_search_cache');

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
        ApprovalStatus: 'APPROVED',
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
      this.logger.log('Best seller product from cache');
      return JSON.parse(cached);
    }

    const product = await this.prisma.products.findMany({
      take: limit,
      where: {
        // Chỉ cho public thấy sản phẩm đã được admin duyệt
        ApprovalStatus: 'APPROVED',
        // Sản phẩm phải đang active
        IsActive: true,
        // Và chưa bị xóa mềm
        IsDeleted: false,
      },
      select: {
        ProductId: true,
        ProductName: true,
        Price: true,
        ThumbnailUrl: true,
        Categories: {
          select: {
            CategoryName: true,
          },
        },
        ProductVariants: {
          select: {
            OrderItems: {
              select: {
                Quantity: true,
              },
            },
          },
        },
      },
    });

    if (product.length === 0) {
      this.logger.error('Product not found');
      return [];
    }

    const result = product
      .map((p) => {
        const sold = p.ProductVariants.reduce((total, variant) => {
          const variantSold = variant.OrderItems.reduce(
            (sum, item) => sum + item.Quantity,
            0,
          );
          return total + variantSold;
        }, 0);

        return {
          ProductId: p.ProductId,
          ProductName: p.ProductName,
          Price: p.Price,
          ThumbnailUrl: p.ThumbnailUrl,
          CategoryName: p.Categories?.CategoryName ?? null,
          Sold: sold,
        };
      })
      .sort((a, b) => b.Sold - a.Sold)
      .slice(0, limit);

    await this.redis.set(cacheKey, JSON.stringify(result), 60 * 1);
    this.logger.log('Best seller product from DB');

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
      this.logger.log('Category product from cache');
      return JSON.parse(cached);
    }

    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      this.prisma.products.findMany({
        where: {
          CategoryId: categoryId,
          // Chỉ cho public thấy sản phẩm đã được admin duyệt
          ApprovalStatus: 'APPROVED',
          // Sản phẩm phải đang active
          IsActive: true,
          // Và chưa bị xóa mềm
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
            select: {
              CategoryName: true,
            },
          },
        },
      }),
      this.prisma.products.count({
        where: {
          CategoryId: categoryId,
          // Count cũng phải cùng điều kiện public như danh sách
          ApprovalStatus: 'APPROVED',
          IsActive: true,
          IsDeleted: false,
        },
      }),
    ]);

    const result = {
      data: products.map((p) => ({
        ProductId: p.ProductId,
        ProductName: p.ProductName,
        Price: p.Price,
        ThumbnailUrl: p.ThumbnailUrl,
        CategoryName: p.Categories?.CategoryName ?? null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 60 * 1);
    this.logger.log('Category product from DB');

    return result;
  } catch (error) {
    this.logger.error(error);
    throw error;
  }
}
// API GET /product/my-products
// Dùng để shopowner xem danh sách sản phẩm của shop mình trong trang quản lý nội bộ.
// API này trả cả sản phẩm đang chờ duyệt, đã duyệt và bị từ chối.
  async getMyProducts(ownerUserId: number, page : number , limit :number, status?: 'PENDING' | 'APPROVED' | 'REJECTED',) {
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
      const whereCondition: any = {
        StoreId: store.StoreId,
        IsDeleted: false,
      };

      if (status) {
        whereCondition.ApprovalStatus = status;
      }
      const products = await this.prisma.products.findMany({
        where: whereCondition,
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
          ApprovalStatus: true,
          RejectReason: true,
          ReviewedAt: true,
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
          // Approval flow: trả trạng thái duyệt để FE hiển thị tab và badge trạng thái
          approvalStatus: product.ApprovalStatus,
          rejectReason: product.RejectReason,
          reviewedAt: product.ReviewedAt,
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
// API PATCH /product/:id
// Dùng để shopowner chỉnh sửa sản phẩm của chính shop mình.
// Nếu sản phẩm đang APPROVED mà bị chỉnh sửa, sản phẩm sẽ quay lại PENDING
// để chờ admin duyệt lại và tạm thời không còn xuất hiện ở public.
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
          ApprovalStatus: true,
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
      // Theo rule hiện tại: sản phẩm đã REJECTED không được sửa để gửi duyệt lại.
// Shopowner phải tạo sản phẩm mới.
      if (existingProduct.ApprovalStatus === 'REJECTED') {
        throw new BadRequestException(
          'Rejected product cannot be updated. Please create a new product.',
        );
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
        ApprovalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
        RejectReason?: string | null;
        ReviewedBy?: number | null;
        ReviewedAt?: Date | null;
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
      // Nếu sản phẩm đang APPROVED mà bị chỉnh sửa,
      // thì phải quay lại PENDING để admin duyệt lại.
      if (existingProduct.ApprovalStatus === 'APPROVED') {
        productData.ApprovalStatus = 'PENDING';
        productData.RejectReason = null;
        productData.ReviewedBy = null;
        productData.ReviewedAt = null;
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
      await this.redis.del('global:product_search_cache');

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
        ApprovalStatus: 'APPROVED',
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
      this.logger.error(`Approved product not found: productId=${id}`);
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

      await this.redis.del('global:product_search_cache');

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
  
  async getProductShop(idShop: number, limit: number) {
  try {
    const cacheKey = `product:shop:${idShop}:${limit}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      this.logger.log('Shop product from cache');
      return JSON.parse(cached);
    }

    const product = await this.prisma.products.findMany({
      take: limit,
      where: {
        StoreId: idShop,
        // Chỉ cho public thấy sản phẩm đã được admin duyệt
        ApprovalStatus: 'APPROVED',
        // Sản phẩm phải đang active
        IsActive: true,
        // Và chưa bị xóa mềm
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
    this.logger.log('Shop product from DB');

    return result;
  } catch (error) {
    this.logger.error(error);
    throw error;
  }
}
//FC.32
// API GET /admin/products/pending
// Dùng để admin xem danh sách các sản phẩm đang chờ duyệt.
// Chỉ lấy các sản phẩm có ApprovalStatus = PENDING.
async getPendingProducts(page: number, limit: number) {
  try {
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      this.prisma.products.findMany({
        where: {
          ApprovalStatus: 'PENDING',
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
          ApprovalStatus: true,
          CreatedAt: true,
          Stores: {
            select: {
              StoreId: true,
              StoreName: true,
            },
          },
          Categories: {
            select: {
              CategoryId: true,
              CategoryName: true,
            },
          },
        },
      }),
      this.prisma.products.count({
        where: {
          ApprovalStatus: 'PENDING',
          IsDeleted: false,
        },
      }),
    ]);

    return {
      message: 'Get pending products successfully',
      data: products.map((product) => ({
        productId: product.ProductId,
        productName: product.ProductName,
        price: Number(product.Price),
        thumbnailUrl: product.ThumbnailUrl,
        approvalStatus: product.ApprovalStatus,
        createdAt: product.CreatedAt,
        store: product.Stores
          ? {
              storeId: product.Stores.StoreId,
              storeName: product.Stores.StoreName,
            }
          : null,
        category: product.Categories
          ? {
              categoryId: product.Categories.CategoryId,
              categoryName: product.Categories.CategoryName,
            }
          : null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    this.logger.error(error);
    throw error;
  }
}

// API GET /product/admin/:id
// Dùng để admin xem chi tiết 1 sản phẩm trước khi duyệt hoặc từ chối.
// API này xem được cả sản phẩm đang PENDING, APPROVED hoặc REJECTED.
async getAdminProductDetail(productId: number) {
  try {
    const product = await this.prisma.products.findFirst({
      where: {
        ProductId: productId,
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
        ApprovalStatus: true,
        RejectReason: true,
        ReviewedBy: true,
        ReviewedAt: true,
        CreatedAt: true,
        UpdatedAt: true,
        Stores: {
          select: {
            StoreId: true,
            StoreName: true,
            OwnerId: true,
          },
        },
        Categories: {
          select: {
            CategoryId: true,
            CategoryName: true,
          },
        },
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

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return {
      message: 'Get admin product detail successfully',
      data: {
        productId: product.ProductId,
        storeId: product.StoreId,
        categoryId: product.CategoryId,
        productName: product.ProductName,
        description: product.Description,
        price: Number(product.Price),
        thumbnailUrl: product.ThumbnailUrl,
        isActive: product.IsActive ?? false,
        approvalStatus: product.ApprovalStatus,
        rejectReason: product.RejectReason,
        reviewedBy: product.ReviewedBy,
        reviewedAt: product.ReviewedAt,
        createdAt: product.CreatedAt,
        updatedAt: product.UpdatedAt,
        store: product.Stores
          ? {
              storeId: product.Stores.StoreId,
              storeName: product.Stores.StoreName,
              ownerId: product.Stores.OwnerId,
            }
          : null,
        category: product.Categories
          ? {
              categoryId: product.Categories.CategoryId,
              categoryName: product.Categories.CategoryName,
            }
          : null,
        images: product.ProductImages.map((image) => ({
          imageId: image.ImageId,
          imageUrl: image.ImageUrl,
        })),
        variants: product.ProductVariants.map((variant) => ({
          variantId: variant.VariantId,
          size: variant.Size,
          color: variant.Color,
          stock: variant.Stock,
          price: Number(variant.Price),
        })),
      },
    };
  } catch (error) {
    this.logger.error(error);
    throw error;
  }
}

// API PATCH /product/admin/:id/approve
// Dùng để admin duyệt sản phẩm đang chờ duyệt.
// Chỉ cho phép approve khi sản phẩm đang ở trạng thái PENDING.
async approveProduct(adminUserId: number, productId: number) {
  try {
    const existingProduct = await this.prisma.products.findFirst({
      where: {
        ProductId: productId,
        IsDeleted: false,
      },
      select: {
        ProductId: true,
        StoreId: true,
        ProductName: true,
        ApprovalStatus: true,
      },
    });

    if (!existingProduct) {
      throw new NotFoundException('Product not found');
    }

    if (existingProduct.ApprovalStatus !== 'PENDING') {
      throw new BadRequestException(
        'Only pending products can be approved',
      );
    }

    const approvedProduct = await this.prisma.products.update({
      where: {
        ProductId: existingProduct.ProductId,
      },
      data: {
        ApprovalStatus: 'APPROVED',
        RejectReason: null,
        ReviewedBy: adminUserId,
        ReviewedAt: new Date(),
      },
      select: {
        ProductId: true,
        StoreId: true,
        ProductName: true,
        ApprovalStatus: true,
        RejectReason: true,
        ReviewedBy: true,
        ReviewedAt: true,
        UpdatedAt: true,
      },
    });

    this.logger.log(
      `Approve product successfully: productId=${approvedProduct.ProductId}, adminUserId=${adminUserId}`,
    );

    await this.redis.deleteByPattern(`product:category:*`);
    await this.redis.deleteByPattern(`product:new:*`);
    await this.redis.deleteByPattern(`product:best-seller:*`);
    await this.redis.deleteByPattern(`product:shop:${approvedProduct.StoreId}:*`);

    return {
      message: 'Approve product successfully',
      data: {
        productId: approvedProduct.ProductId,
        storeId: approvedProduct.StoreId,
        productName: approvedProduct.ProductName,
        approvalStatus: approvedProduct.ApprovalStatus,
        rejectReason: approvedProduct.RejectReason,
        reviewedBy: approvedProduct.ReviewedBy,
        reviewedAt: approvedProduct.ReviewedAt,
        updatedAt: approvedProduct.UpdatedAt,
      },
    };
  } catch (error) {
    this.logger.error(error);
    throw error;
  }
}


// API PATCH /product/admin/:id/reject
// Dùng để admin từ chối sản phẩm đang chờ duyệt và lưu lý do từ chối.
// Chỉ cho phép reject khi sản phẩm đang ở trạng thái PENDING.
async rejectProduct(
  adminUserId: number,
  productId: number,
  reason: string,
) {
  try {
    const existingProduct = await this.prisma.products.findFirst({
      where: {
        ProductId: productId,
        IsDeleted: false,
      },
      select: {
        ProductId: true,
        StoreId: true,
        ProductName: true,
        ApprovalStatus: true,
      },
    });

    if (!existingProduct) {
      throw new NotFoundException('Product not found');
    }

    if (existingProduct.ApprovalStatus !== 'PENDING') {
      throw new BadRequestException(
        'Only pending products can be rejected',
      );
    }

    const rejectedProduct = await this.prisma.products.update({
      where: {
        ProductId: existingProduct.ProductId,
      },
      data: {
        ApprovalStatus: 'REJECTED',
        RejectReason: reason.trim(),
        ReviewedBy: adminUserId,
        ReviewedAt: new Date(),
      },
      select: {
        ProductId: true,
        StoreId: true,
        ProductName: true,
        ApprovalStatus: true,
        RejectReason: true,
        ReviewedBy: true,
        ReviewedAt: true,
        UpdatedAt: true,
      },
    });

    this.logger.log(
      `Reject product successfully: productId=${rejectedProduct.ProductId}, adminUserId=${adminUserId}`,
    );

    await this.redis.deleteByPattern(`product:category:*`);
    await this.redis.deleteByPattern(`product:new:*`);
    await this.redis.deleteByPattern(`product:best-seller:*`);
    await this.redis.deleteByPattern(`product:shop:${rejectedProduct.StoreId}:*`);

    return {
      message: 'Reject product successfully',
      data: {
        productId: rejectedProduct.ProductId,
        storeId: rejectedProduct.StoreId,
        productName: rejectedProduct.ProductName,
        approvalStatus: rejectedProduct.ApprovalStatus,
        rejectReason: rejectedProduct.RejectReason,
        reviewedBy: rejectedProduct.ReviewedBy,
        reviewedAt: rejectedProduct.ReviewedAt,
        updatedAt: rejectedProduct.UpdatedAt,
      },
    };
  } catch (error) {
    this.logger.error(error);
    throw error;
  }
}

  // =============================================
  // COMPARE — Methods dành riêng cho trang So sánh sản phẩm
  // =============================================

  async compareSearch(keyword: string, page: number, limit: number) {
    const result = await this.searchProducts({
      keyword,
      page,
      limit,
    });
    return result;
  }

  async compareSuggestions(keyword: string) {
    return this.getSuggestions(keyword);
  }

  async comparePopular(limit: number) {
    return this.getNewProduct(limit);
  }

  async compareDetail(id: number) {
    return this.getDetailProduct(id);
  }

}