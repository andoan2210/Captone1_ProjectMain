import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Logger } from 'nestjs-pino';
import { RedisService } from 'src/shared/service/redis.service';
import { UploadService } from 'src/upload/upload.service';

@Injectable()
export class StoreService {
  constructor(
    private readonly prisma : PrismaService,
    private readonly logger : Logger,
    private readonly redis : RedisService,
    private readonly uploadService : UploadService
  ){}
  create(createStoreDto: CreateStoreDto) {
    return 'This action adds a new store';
  }

  findAll() {
    return `This action returns all store`;
  }
  // Lấy thông tin cửa hàng của user đang đăng nhập
  async getMyStore(userId: number) {
    const store = await this.prisma.stores.findFirst({
      where: {
        // Tìm store theo owner hiện tại
        OwnerId: userId,
        // Không lấy store đã bị xóa mềm
        IsDeleted: false,
      },
      select: {
        // Chỉ chọn các field FE đang cần hiển thị
        StoreId: true,
        OwnerId: true,
        StoreName: true,
        Description: true,
        LogoUrl: true,
        IsActive: true,
        IsDeleted: true,
        CreatedAt: true,
        //Quốc sửa cửa hàng///////////
        _count: {
          select: {
            Products: {
              where: {
                IsDeleted: false,
              }
            },
            Orders: true,
            Vouchers: {
              where: {
                IsActive: true,
              }
            }
          }
        }
      },
    });

    // Nếu owner chưa có cửa hàng thì trả lỗi 404
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Trả dữ liệu theo format rõ ràng để FE dễ liên kết 
    return {
      message: 'Get store information successfully',
      data: {
        storeId: store.StoreId,
        ownerId: store.OwnerId,
        storeName: store.StoreName,
        description: store.Description,
        logoUrl: store.LogoUrl,
        isActive: store.IsActive,
        isDeleted: store.IsDeleted,
        createdAt: store.CreatedAt,
        totalProducts: store._count?.Products || 0,
        totalOrders: store._count?.Orders || 0,
        totalVouchers: store._count?.Vouchers || 0,
      },
    };
  }

 async updateMyStore(
  userId: number,
  dto: UpdateStoreDto,
  file?: Express.Multer.File,
) {
  try {
    // Lấy store của user
    const store = await this.prisma.stores.findFirst({
      where: {
        OwnerId: userId,
        IsDeleted: false,
      },
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    let logoUrl = store.LogoUrl;

    // Upload ảnh (nếu có)
    if (file) {
      const newLogo = await this.uploadService.uploadImage(file, 'logo');

      // delete ảnh cũ (nếu có)
      if (store.LogoUrl) {
        try{
          await this.uploadService.deleteFile(store.LogoUrl);
        }catch(error){
          this.logger.error(error);
        }
      }

      logoUrl = newLogo;
    }

    // Update DB
    const updatedStore = await this.prisma.stores.update({
      where: {
        StoreId: store.StoreId,
      },
      data: {
        ...(dto.storeName && { StoreName: dto.storeName }),
        ...(dto.description && { Description: dto.description }),
        ...(logoUrl && { LogoUrl: logoUrl }),
      },
    });

    this.logger.log(`Update store information successfully`);
    return {
      message: 'Update store information successfully',
    };
  } catch (error) {
    this.logger.error(error);
    throw new BadRequestException('Failed to update store information');
  }
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
      LEFT JOIN ProductVariants pv 
        ON pv.ProductId = p.ProductId
      LEFT JOIN OrderItems oi 
        ON oi.VariantId = pv.VariantId
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

  async getStoreByProduct(productId: number){
    try{
      const store = await this.prisma.stores.findFirst({
        where: {
          Products: {
            some: {
              ProductId: productId,
              IsActive: true,
              IsDeleted: false,
            },
          },
        },
        select: {
          StoreId: true,
          StoreName: true,
          LogoUrl: true,
          _count: {
          select: {
            Products:{
              where :{
                IsActive : true,
                IsDeleted : false,
                ApprovalStatus: 'APPROVED',
              }
            }
          },
        },
        },
      }); 
      if(!store){
        throw new NotFoundException('Store not found');
      }
      this.logger.log('Store get by product');
      return {
        storeId: store.StoreId,
        storeName: store.StoreName,
        logoUrl: store.LogoUrl,
        productCount: store._count.Products,
      };
    }catch(error){
      this.logger.error(error);
      throw error;
    }
  }

  
  // API GET /store/:id
  // Dùng để user xem chi tiết thông tin shop (trang ShopDetail public)
  // Trả về thông tin cửa hàng, số sản phẩm, thông tin owner
  async findOne(id: number) {
    try {
      const cacheKey = `store:detail:${id}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.log('Store detail from cache');
        return JSON.parse(cached);
      }

      const store = await this.prisma.stores.findFirst({
        where: {
          StoreId: id,
          IsActive: true,
          IsDeleted: false,
        },
        select: {
          StoreId: true,
          OwnerId: true,
          StoreName: true,
          Description: true,
          LogoUrl: true,
          IsActive: true,
          CreatedAt: true,
          Users: {
            select: {
              FullName: true,
              AvatarUrl: true,
            },
          },
          // Đếm số sản phẩm đã được duyệt và đang active
          _count: {
            select: {
              Products: {
                where: {
                  ApprovalStatus: 'APPROVED',
                  IsActive: true,
                  IsDeleted: false,
                },
              },
            },
          },
        },
      });

      if (!store) {
        throw new NotFoundException('Store not found');
      }

      // Tính rating trung bình (dựa trên tổng sold - placeholder logic)
      // Hiện tại chưa có bảng Review nên trả rating mặc định
      const soldResult = await this.prisma.$queryRaw<
        { TotalSold: number }[]
      >`
        SELECT ISNULL(SUM(oi.Quantity), 0) as TotalSold
        FROM Products p
        JOIN ProductVariants pv ON pv.ProductId = p.ProductId
        JOIN OrderItems oi ON oi.VariantId = pv.VariantId
        WHERE p.StoreId = ${id}
          AND p.IsActive = 1
          AND p.IsDeleted = 0
          AND p.ApprovalStatus = 'APPROVED'
      `;

      const totalSold = Number(soldResult[0]?.TotalSold || 0);

      const result = {
        storeId: store.StoreId,
        ownerId: store.OwnerId,
        storeName: store.StoreName,
        description: store.Description,
        logoUrl: store.LogoUrl,
        isActive: store.IsActive,
        createdAt: store.CreatedAt,
        ownerName: store.Users?.FullName || null,
        ownerAvatar: store.Users?.AvatarUrl || null,
        productCount: store._count.Products,
        totalSold: totalSold,
        // Placeholder: chưa có bảng Follow / Review
        followerCount: 0,
        rating: 4.9,
      };

      // Cache 5 phút
      await this.redis.set(cacheKey, JSON.stringify(result), 60 * 5);
      this.logger.log(`Store detail from DB: storeId=${id}`);

      return result;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  update(id: number, updateStoreDto: UpdateStoreDto) {
    return `This action updates a #${id} store`;
  }

  remove(id: number) {
    return `This action removes a #${id} store`;
  }
}
