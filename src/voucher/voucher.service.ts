import { Injectable } from '@nestjs/common';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { UpdateVoucherDto } from './dto/update-voucher.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Logger } from 'nestjs-pino';
import { RedisService } from 'src/shared/service/redis.service';

@Injectable()
export class VoucherService {
  constructor(private readonly prisma : PrismaService,
    private readonly logger : Logger,
    private readonly redis : RedisService
  ){}
  create(createVoucherDto: CreateVoucherDto) {
    return 'This action adds a new voucher';
  }

async getVoucherByBest(limit: number) {
  try {
    const cacheKey = `voucher:best:${limit}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      this.logger.log('Voucher from cache');
      return JSON.parse(cached);
    }

    const vouchers = await this.prisma.vouchers.findMany({
      take: limit,
      where: {
        IsActive: true,
        Quantity: { gt: 0 },
        ExpiredDate: { gt: new Date() },
      },
      orderBy: [
        { DiscountPercent: 'desc' },
        { ExpiredDate: 'asc' },
      ],
      select: {
        VoucherId: true,
        Code: true,
        DiscountPercent: true,
        Quantity: true,
        ExpiredDate: true,
      },
    });

    const result = vouchers.map(v => ({
      id: v.VoucherId,
      code: v.Code,
      discount: v.DiscountPercent,
      quantity: v.Quantity,
      expiredDate: v.ExpiredDate,
    }));

    await this.redis.set(cacheKey, JSON.stringify(result), 60);

    this.logger.log('Voucher from DB');

    return result;

  } catch (error) {
    this.logger.error(error);
    throw error;
    }
  }

  findOne(id: number) {
    return `This action returns a #${id} voucher`;
  }

  update(id: number, updateVoucherDto: UpdateVoucherDto) {
    return `This action updates a #${id} voucher`;
  }

  remove(id: number) {
    return `This action removes a #${id} voucher`;
  }
}
