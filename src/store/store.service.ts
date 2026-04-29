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
  async create(userId: number, createStoreDto: CreateStoreDto) {
    try {
      // Kiểm tra user đã có store chưa
      const existingStore = await this.prisma.stores.findFirst({
        where: { OwnerId: userId, IsDeleted: false },
      });

      if (existingStore) {
        throw new BadRequestException('Bạn đã có cửa hàng hoặc đơn đang chờ duyệt');
      }

      // Tạo store mới (IsActive = false → chờ Admin duyệt)
      const store = await this.prisma.stores.create({
        data: {
          OwnerId: userId,
          StoreName: createStoreDto.storeName,
          Description: createStoreDto.description || null,
          IsActive: false,
          IsDeleted: false,
        },
      });

      this.logger.log(`Store created for approval: storeId=${store.StoreId}, userId=${userId}`);

      return {
        message: 'Đơn đăng ký đã được gửi, vui lòng chờ Admin duyệt',
        data: {
          storeId: store.StoreId,
          storeName: store.StoreName,
        },
      };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
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

  
  findOne(id: number) {
    return `This action returns a #${id} store`;
  }

  update(id: number, updateStoreDto: UpdateStoreDto) {
    return `This action updates a #${id} store`;
  }

  remove(id: number) {
    return `This action removes a #${id} store`;
  }

  // =============================================
  // ADMIN — Duyệt đơn đăng ký cửa hàng
  // =============================================

  // Lấy danh sách cửa hàng chờ duyệt (IsActive = false, IsDeleted = false)
  async getPendingStores() {
    try {
      const stores = await this.prisma.stores.findMany({
        where: {
          IsActive: false,
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
              UserId: true,
              FullName: true,
              Email: true,
              Phone: true,
              AvatarUrl: true,
            },
          },
        },
        orderBy: {
          CreatedAt: 'desc',
        },
      });

      return {
        message: 'Get pending stores successfully',
        data: stores.map((store) => ({
          storeId: store.StoreId,
          ownerId: store.OwnerId,
          storeName: store.StoreName,
          description: store.Description,
          logoUrl: store.LogoUrl,
          isActive: store.IsActive,
          createdAt: store.CreatedAt,
          owner: {
            userId: store.Users.UserId,
            fullName: store.Users.FullName,
            email: store.Users.Email,
            phone: store.Users.Phone,
            avatarUrl: store.Users.AvatarUrl,
          },
        })),
      };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  // Admin duyệt cửa hàng → IsActive = true
  async approveStore(storeId: number) {
    try {
      const store = await this.prisma.stores.findFirst({
        where: { StoreId: storeId, IsDeleted: false },
      });

      if (!store) {
        throw new NotFoundException('Store not found');
      }

      await this.prisma.stores.update({
        where: { StoreId: storeId },
        data: { IsActive: true },
      });

      // Đảm bảo user có role ShopOwner
      await this.prisma.users.update({
        where: { UserId: store.OwnerId },
        data: { Role: 'ShopOwner' },
      });

      this.logger.log(`Admin approved store: storeId=${storeId}`);

      return {
        message: 'Store approved successfully',
      };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  // Admin từ chối cửa hàng → IsDeleted = true, đổi role về Client
  async rejectStore(storeId: number) {
    try {
      const store = await this.prisma.stores.findFirst({
        where: { StoreId: storeId, IsDeleted: false },
      });

      if (!store) {
        throw new NotFoundException('Store not found');
      }

      // Xóa mềm store
      await this.prisma.stores.update({
        where: { StoreId: storeId },
        data: { IsDeleted: true, IsActive: false },
      });

      // Đổi role user về Client
      await this.prisma.users.update({
        where: { UserId: store.OwnerId },
        data: { Role: 'Client' },
      });

      this.logger.log(`Admin rejected store: storeId=${storeId}`);

      return {
        message: 'Store rejected successfully',
      };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
}
