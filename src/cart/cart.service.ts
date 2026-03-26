import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateCartDto } from './dto/create-cart.dto';
import { UpdateCartDto } from './dto/update-cart.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Logger } from 'nestjs-pino';
import { RedisService } from 'src/shared/service/redis.service';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService,
    private readonly logger: Logger,
    private readonly redis: RedisService
  ){}
  async addToCart(userId: number, createCartDto: CreateCartDto) {
    try{
      const { variantId, quantity } = createCartDto;

    // Check variant
    const variant = await this.prisma.productVariants.findUnique({
      where: { VariantId: variantId },
    });
    this.logger.log('Variant found', variant);

    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    if (variant.Stock < quantity) {
      throw new BadRequestException('Not enough stock');
    }

    // Lấy hoặc tạo cart
    let cart = await this.prisma.carts.findUnique({
      where: { UserId : userId },
    });

    if (!cart) {
      cart = await this.prisma.carts.create({
        data: { UserId: userId },
      });
  }

  // Upsert cart item (gộp nếu đã tồn tại)
    await this.prisma.cartItems.upsert({
      where: {
        CartId_VariantId: {
          CartId: cart.CartId,
          VariantId: variantId,
        },
      },
      update: {
        Quantity: { increment: quantity },
      },
      create: {
        CartId: cart.CartId,
        VariantId: variantId,
        Quantity: quantity,
      },
    });
    this.logger.log('Added to cart successfully');
    return { message: 'Added to cart successfully' };
      }catch(error){
        this.logger.error(error);
        throw error;
      }
    }

  findAll() {
    return `This action returns all cart`;
  }

  findOne(id: number) {
    return `This action returns a #${id} cart`;
  }

  update(id: number, updateCartDto: UpdateCartDto) {
    return `This action updates a #${id} cart`;
  }

  remove(id: number) {
    return `This action removes a #${id} cart`;
  }
}
