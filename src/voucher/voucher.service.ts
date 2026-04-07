import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { UpdateVoucherDto } from './dto/update-voucher.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Logger } from 'nestjs-pino';
import { RedisService } from 'src/shared/service/redis.service';
import { GetMyVouchersDto } from './dto/get-my-vouchers.dto';

@Injectable()
export class VoucherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
    private readonly redis: RedisService,
  ) {}

  // Tạo voucher mới cho store của shop owner đang đăng nhập
  async create(userId: number, createVoucherDto: CreateVoucherDto) {
    try {
      const { code, discountPercent, quantity, expiredDate, isActive } =
        createVoucherDto;

      // Chuẩn hóa code voucher
      const normalizedCode = code.trim().toUpperCase();

      // Chuyển ngày hết hạn từ string sang Date
      const parsedExpiredDate = new Date(expiredDate);

      // Kiểm tra ngày hết hạn hợp lệ
      if (Number.isNaN(parsedExpiredDate.getTime())) {
        throw new BadRequestException('Expired date is invalid');
      }

      // Kiểm tra ngày hết hạn phải ở tương lai
      if (parsedExpiredDate <= new Date()) {
        throw new BadRequestException('Expired date must be in the future');
      }

      // Tìm store của user đang đăng nhập
      const store = await this.prisma.stores.findFirst({
        where: {
          OwnerId: userId,
          IsDeleted: false,
          IsActive: true,
        },
        select: {
          StoreId: true,
          StoreName: true,
        },
      });

      // Nếu user chưa có store thì báo lỗi
      if (!store) {
        throw new NotFoundException('Store not found');
      }

      // Kiểm tra code voucher đã tồn tại chưa
      const existingVoucher = await this.prisma.vouchers.findUnique({
        where: {
          Code: normalizedCode,
        },
        select: {
          VoucherId: true,
        },
      });

      // Nếu mã đã tồn tại thì không cho tạo
      if (existingVoucher) {
        throw new BadRequestException('Voucher code already exists');
      }

      // Tạo voucher mới
      const createdVoucher = await this.prisma.vouchers.create({
        data: {
          StoreId: store.StoreId,
          Code: normalizedCode,
          DiscountPercent: discountPercent,
          Quantity: quantity,
          ExpiredDate: parsedExpiredDate,
          IsActive: isActive ?? true,
        },
        select: {
          VoucherId: true,
          StoreId: true,
          Code: true,
          DiscountPercent: true,
          Quantity: true,
          ExpiredDate: true,
          IsActive: true,
        },
      });

      // Xóa cache top voucher
      await this.redis.deleteByPattern('voucher:best:*');

      return {
        message: 'Voucher created successfully',
        data: {
          voucherId: createdVoucher.VoucherId,
          storeId: createdVoucher.StoreId,
          code: createdVoucher.Code,
          discountPercent: createdVoucher.DiscountPercent,
          quantity: createdVoucher.Quantity,
          expiredDate: createdVoucher.ExpiredDate,
          isActive: createdVoucher.IsActive,
          applyScope: 'ALL_PRODUCTS_IN_SHOP',
        },
      };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  // Lấy danh sách voucher tốt nhất, ưu tiên discount cao và còn hạn
  async getVoucherByBest(limit: number) {
    try {
      const cacheKey = `voucher:best:${limit}`;

      // Kiểm tra cache trước
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.log('Voucher from cache');
        return JSON.parse(cached);
      }

      // Nếu chưa có cache thì lấy từ DB
      const vouchers = await this.prisma.vouchers.findMany({
        take: limit,
        where: {
          IsActive: true,
          Quantity: { gt: 0 },
          ExpiredDate: { gt: new Date() },
        },
        orderBy: [{ DiscountPercent: 'desc' }, { ExpiredDate: 'asc' }],
        select: {
          VoucherId: true,
          Code: true,
          DiscountPercent: true,
          Quantity: true,
          ExpiredDate: true,
        },
      });

      const result = vouchers.map((v) => ({
        id: v.VoucherId,
        code: v.Code,
        discount: v.DiscountPercent,
        quantity: v.Quantity,
        expiredDate: v.ExpiredDate,
      }));

      // Lưu cache 60 giây
      await this.redis.set(cacheKey, JSON.stringify(result), 60);

      this.logger.log('Voucher from DB');
      return result;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  // Lấy chi tiết 1 voucher theo id
  async findOne(id: number) {
    const voucher = await this.prisma.vouchers.findUnique({
      where: { VoucherId: id },
      select: {
        VoucherId: true,
        StoreId: true,
        Code: true,
        DiscountPercent: true,
        Quantity: true,
        ExpiredDate: true,
        IsActive: true,
      },
    });

    // Không tìm thấy voucher thì báo lỗi
    if (!voucher) {
      throw new NotFoundException('Voucher not found');
    }

    return {
      voucherId: voucher.VoucherId,
      storeId: voucher.StoreId,
      code: voucher.Code,
      discountPercent: voucher.DiscountPercent,
      quantity: voucher.Quantity,
      expiredDate: voucher.ExpiredDate,
      isActive: voucher.IsActive,
      applyScope: 'ALL_PRODUCTS_IN_SHOP',
    };
  }

  // Cập nhật voucher của shop owner đang đăng nhập
  async update(userId: number, id: number, updateVoucherDto: UpdateVoucherDto) {
    try {
      // Tìm store của user hiện tại
      const store = await this.prisma.stores.findFirst({
        where: {
          OwnerId: userId,
          IsDeleted: false,
          IsActive: true,
        },
        select: {
          StoreId: true,
        },
      });

      // Nếu user chưa có store thì báo lỗi
      if (!store) {
        throw new NotFoundException('Store not found');
      }

      // Tìm voucher cần sửa
      const existingVoucher = await this.prisma.vouchers.findUnique({
        where: {
          VoucherId: id,
        },
        select: {
          VoucherId: true,
          StoreId: true,
          Code: true,
          DiscountPercent: true,
          Quantity: true,
          ExpiredDate: true,
          IsActive: true,
        },
      });

      // Nếu voucher không tồn tại thì báo lỗi
      if (!existingVoucher) {
        throw new NotFoundException('Voucher not found');
      }

      // Kiểm tra voucher có thuộc shop đang đăng nhập không
      if (existingVoucher.StoreId !== store.StoreId) {
        throw new BadRequestException(
          'You are not allowed to update this voucher',
        );
      }

      const dataToUpdate: {
        Code?: string;
        DiscountPercent?: number;
        Quantity?: number;
        ExpiredDate?: Date;
        IsActive?: boolean;
      } = {};

      // Nếu có gửi code mới thì chuẩn hóa và check trùng
      if (updateVoucherDto.code !== undefined) {
        const normalizedCode = updateVoucherDto.code.trim().toUpperCase();

        if (!normalizedCode) {
          throw new BadRequestException('Voucher code must not be empty');
        }

        if (normalizedCode !== existingVoucher.Code) {
          const duplicateVoucher = await this.prisma.vouchers.findUnique({
            where: {
              Code: normalizedCode,
            },
            select: {
              VoucherId: true,
            },
          });

          if (duplicateVoucher) {
            throw new BadRequestException('Voucher code already exists');
          }
        }

        dataToUpdate.Code = normalizedCode;
      }

      // Nếu có gửi discount mới thì cập nhật
      if (updateVoucherDto.discountPercent !== undefined) {
        dataToUpdate.DiscountPercent = updateVoucherDto.discountPercent;
      }

      // Nếu có gửi quantity mới thì cập nhật
      if (updateVoucherDto.quantity !== undefined) {
        dataToUpdate.Quantity = updateVoucherDto.quantity;
      }

      // Nếu có gửi expiredDate mới thì kiểm tra rồi cập nhật
      if (updateVoucherDto.expiredDate !== undefined) {
        const parsedExpiredDate = new Date(updateVoucherDto.expiredDate);

        if (Number.isNaN(parsedExpiredDate.getTime())) {
          throw new BadRequestException('Expired date is invalid');
        }

        if (parsedExpiredDate <= new Date()) {
          throw new BadRequestException('Expired date must be in the future');
        }

        dataToUpdate.ExpiredDate = parsedExpiredDate;
      }

      // Nếu có gửi isActive mới thì cập nhật
      if (updateVoucherDto.isActive !== undefined) {
        dataToUpdate.IsActive = updateVoucherDto.isActive;
      }

      // Nếu body rỗng thì báo lỗi
      if (Object.keys(dataToUpdate).length === 0) {
        throw new BadRequestException('No data provided to update');
      }

      // Update voucher trong DB
      const updatedVoucher = await this.prisma.vouchers.update({
        where: {
          VoucherId: id,
        },
        data: dataToUpdate,
        select: {
          VoucherId: true,
          StoreId: true,
          Code: true,
          DiscountPercent: true,
          Quantity: true,
          ExpiredDate: true,
          IsActive: true,
        },
      });

      // Xóa cache để đồng bộ dữ liệu mới
      await this.redis.deleteByPattern('voucher:best:*');

      return {
        message: 'Voucher updated successfully',
        data: {
          voucherId: updatedVoucher.VoucherId,
          storeId: updatedVoucher.StoreId,
          code: updatedVoucher.Code,
          discountPercent: updatedVoucher.DiscountPercent,
          quantity: updatedVoucher.Quantity,
          expiredDate: updatedVoucher.ExpiredDate,
          isActive: updatedVoucher.IsActive,
          applyScope: 'ALL_PRODUCTS_IN_SHOP',
        },
      };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  // Xóa mềm voucher của shop owner đang đăng nhập
  async remove(userId: number, id: number) {
    try {
      // Tìm store của user hiện tại
      const store = await this.prisma.stores.findFirst({
        where: {
          OwnerId: userId,
          IsDeleted: false,
          IsActive: true,
        },
        select: {
          StoreId: true,
        },
      });

      // Nếu user chưa có store thì báo lỗi
      if (!store) {
        throw new NotFoundException('Store not found');
      }

      // Tìm voucher cần xóa
      const existingVoucher = await this.prisma.vouchers.findUnique({
        where: {
          VoucherId: id,
        },
        select: {
          VoucherId: true,
          StoreId: true,
          Code: true,
          IsActive: true,
        },
      });

      // Nếu voucher không tồn tại thì báo lỗi
      if (!existingVoucher) {
        throw new NotFoundException('Voucher not found');
      }

      // Kiểm tra voucher có thuộc shop đang đăng nhập không
      if (existingVoucher.StoreId !== store.StoreId) {
        throw new BadRequestException(
          'You are not allowed to delete this voucher',
        );
      }

      // Nếu voucher đã inactive rồi thì báo lỗi
      if (!existingVoucher.IsActive) {
        throw new BadRequestException('Voucher has already been deleted');
      }

      // Xóa mềm bằng cách chuyển IsActive = false
      const deletedVoucher = await this.prisma.vouchers.update({
        where: {
          VoucherId: id,
        },
        data: {
          IsActive: false,
        },
        select: {
          VoucherId: true,
          StoreId: true,
          Code: true,
          DiscountPercent: true,
          Quantity: true,
          ExpiredDate: true,
          IsActive: true,
        },
      });

      // Xóa cache để đồng bộ dữ liệu mới
      await this.redis.deleteByPattern('voucher:best:*');

      return {
        message: 'Voucher deleted successfully',
        data: {
          voucherId: deletedVoucher.VoucherId,
          storeId: deletedVoucher.StoreId,
          code: deletedVoucher.Code,
          discountPercent: deletedVoucher.DiscountPercent,
          quantity: deletedVoucher.Quantity,
          expiredDate: deletedVoucher.ExpiredDate,
          isActive: deletedVoucher.IsActive,
          applyScope: 'ALL_PRODUCTS_IN_SHOP',
        },
      };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  // Lấy danh sách voucher của shop owner đang đăng nhập
async getMyVouchers(userId: number, query: GetMyVouchersDto) {
  try {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const search = query.search?.trim();
    const status = query.status ?? 'all';

    const skip = (page - 1) * limit;
    const now = new Date();

    // Tìm store của user hiện tại
    const store = await this.prisma.stores.findFirst({
      where: {
        OwnerId: userId,
        IsDeleted: false,
        IsActive: true,
      },
      select: {
        StoreId: true,
        StoreName: true,
      },
    });

    // Nếu user chưa có store thì báo lỗi
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const whereCondition: any = {
      StoreId: store.StoreId,
    };

    // Search theo mã voucher
    if (search) {
      whereCondition.Code = {
        contains: search,
      };
    }

    // Lọc theo trạng thái
    if (status === 'active') {
      whereCondition.IsActive = true;
      whereCondition.ExpiredDate = {
        gt: now,
      };
    }

    if (status === 'inactive') {
      whereCondition.IsActive = false;
    }

    if (status === 'expired') {
      whereCondition.ExpiredDate = {
        lte: now,
      };
    }

    // Đếm tổng số voucher theo điều kiện lọc
    const totalItems = await this.prisma.vouchers.count({
      where: whereCondition,
    });

    // Lấy danh sách voucher
    const vouchers = await this.prisma.vouchers.findMany({
      where: whereCondition,
      skip,
      take: limit,
      orderBy: [
        { VoucherId: 'desc' },
      ],
      select: {
        VoucherId: true,
        StoreId: true,
        Code: true,
        DiscountPercent: true,
        Quantity: true,
        ExpiredDate: true,
        IsActive: true,
      },
    });

  const items = vouchers.map((voucher) => {
  let displayStatus = 'inactive';

  if (voucher.ExpiredDate) {
    if (voucher.IsActive && voucher.ExpiredDate > now) {
      displayStatus = 'active';
    } else if (voucher.ExpiredDate <= now) {
      displayStatus = 'expired';
    }
  }

  return {
    voucherId: voucher.VoucherId,
    storeId: voucher.StoreId,
    code: voucher.Code,
    discountPercent: voucher.DiscountPercent,
    quantity: voucher.Quantity,
    expiredDate: voucher.ExpiredDate,
    isActive: voucher.IsActive,
    applyScope: 'ALL_PRODUCTS_IN_SHOP',
    displayStatus,
  };
    });

    return {
      message: 'Get voucher list successfully',
      data: {
        storeId: store.StoreId,
        storeName: store.StoreName,
        items,
        pagination: {
          page,
          limit,
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
        },
        filters: {
          search: search ?? '',
          status,
        },
      },
    };
  } catch (error) {
    this.logger.error(error);
    throw error;
  }
}
}