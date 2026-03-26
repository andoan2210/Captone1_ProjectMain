import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Logger } from 'nestjs-pino';
import { RedisService } from 'src/shared/service/redis.service';

@Injectable()
export class StoreService {
  constructor(
    private readonly prisma : PrismaService,
    private readonly logger : Logger,
    private readonly redis : RedisService
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

async updateMyStore(userId: number, updateStoreDto: UpdateStoreDto) {
    const store = await this.prisma.stores.findFirst({
      where: {
        OwnerId: userId,
        IsDeleted: false,
      },
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const dataToUpdate: {
      StoreName?: string;
      Description?: string | null;
      LogoUrl?: string | null;
      IsActive?: boolean;
    } = {};

    if (updateStoreDto.storeName !== undefined) {
      dataToUpdate.StoreName = updateStoreDto.storeName.trim();
    }

    if (updateStoreDto.description !== undefined) {
      dataToUpdate.Description = updateStoreDto.description.trim();
    }

    if (updateStoreDto.logoUrl !== undefined) {
      dataToUpdate.LogoUrl = updateStoreDto.logoUrl.trim();
    }

    if (updateStoreDto.isActive !== undefined) {
      dataToUpdate.IsActive = updateStoreDto.isActive;
    }

    if (Object.keys(dataToUpdate).length === 0) {
      throw new BadRequestException('No valid fields to update');
    }

    const updatedStore = await this.prisma.stores.update({
      where: {
        StoreId: store.StoreId,
      },
      data: dataToUpdate,
      select: {
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

    await this.redis.del(`store:me:${userId}`);

    return {
      message: 'Update store information successfully',
      data: {
        storeId: updatedStore.StoreId,
        ownerId: updatedStore.OwnerId,
        storeName: updatedStore.StoreName,
        description: updatedStore.Description,
        logoUrl: updatedStore.LogoUrl,
        isActive: updatedStore.IsActive,
        isDeleted: updatedStore.IsDeleted,
        createdAt: updatedStore.CreatedAt,
      },
    };
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
