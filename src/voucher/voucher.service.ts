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

      // Kiểm tra ngày hết hạn có hợp lệ không
      if (Number.isNaN(parsedExpiredDate.getTime())) {
        throw new BadRequestException('Expired date is invalid');
      }

      // Kiểm tra ngày hết hạn phải lớn hơn hiện tại
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

      // Kiểm tra mã voucher đã tồn tại chưa
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

      // Tạo voucher mới trong database
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

      // Xóa cache top voucher để lần sau lấy dữ liệu mới
      await this.redis.deleteByPattern('voucher:best:*');

      // Trả kết quả cho frontend
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
      // Ghi log lỗi và throw lại
      this.logger.error(error);
      throw error;
    }
  }

  // Lấy danh sách voucher tốt nhất, có cache redis
  async getVoucherByBest(limit: number) {
    try {
      const cacheKey = `voucher:best:${limit}`;

      // Kiểm tra cache trước
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.log('Voucher from cache');
        return JSON.parse(cached);
      }

      // Nếu chưa có cache thì lấy từ database
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

      // Lưu cache trong 60 giây
      await this.redis.set(cacheKey, JSON.stringify(result), 60);

      this.logger.log('Voucher from DB');
      return result;
    } catch (error) {
      // Ghi log lỗi và throw lại
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

    // Trả dữ liệu voucher
    return {
      voucherId: voucher.VoucherId,
      storeId: voucher.StoreId,
      code: voucher.Code,
      discountPercent: voucher.DiscountPercent,
      quantity: voucher.Quantity,
      expiredDate: voucher.ExpiredDate,
      isActive: voucher.IsActive,
    };
  }

  // Hàm update voucher, hiện chưa triển khai
  update(id: number, updateVoucherDto: UpdateVoucherDto) {
    return `This action updates a #${id} voucher`;
  }

  // Hàm xóa voucher, hiện chưa triển khai
  remove(id: number) {
    return `This action removes a #${id} voucher`;
  }
}