import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCartDto } from './dto/create-cart.dto';
import { UpdateCartDto } from './dto/update-cart.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Logger } from 'nestjs-pino';
import { RedisService } from 'src/shared/service/redis.service';

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
    private readonly redis: RedisService,
  ) {}

  /* ═══════════════════════════════════════════════════════
     THÊM SẢN PHẨM VÀO GIỎ HÀNG
  ═══════════════════════════════════════════════════════ */
  async addToCart(userId: number, createCartDto: CreateCartDto) {
    try {
      const { variantId, quantity } = createCartDto;

      // Kiểm tra variant
      const variant = await this.prisma.productVariants.findUnique({
        where: { VariantId: variantId },
      });

      if (!variant) throw new NotFoundException('Variant not found');
      if (variant.Stock < quantity) throw new BadRequestException('Not enough stock');

      // Lấy hoặc tạo cart
      let cart = await this.prisma.carts.findUnique({ where: { UserId: userId } });
      if (!cart) {
        cart = await this.prisma.carts.create({ data: { UserId: userId } });
      }

      // Upsert cart item (gộp nếu đã tồn tại)
      await this.prisma.cartItems.upsert({
        where: { CartId_VariantId: { CartId: cart.CartId, VariantId: variantId } },
        update: { Quantity: { increment: quantity } },
        create: { CartId: cart.CartId, VariantId: variantId, Quantity: quantity },
      });

      this.logger.log('Added to cart successfully');
      return { message: 'Added to cart successfully' };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  /* ═══════════════════════════════════════════════════════
     LẤY GIỎ HÀNG CỦA USER (KÈM ĐẦY ĐỦ THÔNG TIN + TỔNG TIỀN)
  ═══════════════════════════════════════════════════════ */
  async getCartByUserId(userId: number) {
    try {
      const cart = await this.prisma.carts.findUnique({
        where: { UserId: userId },
        include: {
          CartItems: {
            include: {
              ProductVariants: {
                include: {
                  Products: {
                    include: {
                      ProductImages: { take: 1 },
                    },
                  },
                },
              },
            },
          },
        },
      });

      // Giỏ hàng chưa tồn tại → trả về rỗng
      if (!cart) {
        return {
          cartId: null,
          cartItems: [],
          totalItems: 0,
          totalAmount: 0,
        };
      }

      // Map từng item
      const cartItems = cart.CartItems.map((item) => {
        const variant = item.ProductVariants;
        const product = variant?.Products;
        const unitPrice = Number(variant?.Price ?? product?.Price ?? 0);

        return {
          cartItemId : item.CartItemId,
          variantId  : item.VariantId,
          quantity   : item.Quantity,
          ProductVariants: {
            VariantId : variant?.VariantId,
            Size      : variant?.Size,
            Color     : variant?.Color,
            Stock     : variant?.Stock,
            Price     : variant?.Price,
            Products  : product
              ? {
                  ProductId   : product.ProductId,
                  ProductName : product.ProductName,
                  ThumbnailUrl: product.ThumbnailUrl,
                  Price       : product.Price,
                  ProductImages: product.ProductImages,
                }
              : null,
          },
          lineTotal: unitPrice * item.Quantity,
        };
      });

      // Tính tổng tiền
      const totalAmount = cartItems.reduce((sum, i) => sum + i.lineTotal, 0);

      this.logger.log(`Fetched cart for userId=${userId}, items=${cartItems.length}`);

      return {
        cartId     : cart.CartId,
        cartItems,
        totalItems : cartItems.length,
        totalAmount,
      };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  /* ═══════════════════════════════════════════════════════
     CẬP NHẬT SỐ LƯỢNG SẢN PHẨM TRONG GIỎ HÀNG
  ═══════════════════════════════════════════════════════ */
  async updateCartItemQuantity(userId: number, cartItemId: number, dto: UpdateCartDto) {
    try {
      const { quantity } = dto;

      if (!quantity || quantity < 1) {
        throw new BadRequestException('Số lượng phải lớn hơn 0');
      }

      // Kiểm tra CartItem tồn tại
      const cartItem = await this.prisma.cartItems.findUnique({
        where: { CartItemId: cartItemId },
        include: {
          Carts           : true,
          ProductVariants : true,
        },
      });

      if (!cartItem) throw new NotFoundException('Không tìm thấy sản phẩm trong giỏ hàng');

      // Kiểm tra quyền
      if (cartItem.Carts.UserId !== userId) {
        throw new ForbiddenException('Bạn không có quyền chỉnh sửa sản phẩm này');
      }

      // Kiểm tra tồn kho
      if (cartItem.ProductVariants.Stock < quantity) {
        throw new BadRequestException(
          `Chỉ còn ${cartItem.ProductVariants.Stock} sản phẩm trong kho`,
        );
      }

      await this.prisma.cartItems.update({
        where: { CartItemId: cartItemId },
        data : { Quantity: quantity },
      });

      this.logger.log(`CartItem ${cartItemId} updated to quantity=${quantity}`);
      return { message: 'Cập nhật số lượng thành công', cartItemId, quantity };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  /* ═══════════════════════════════════════════════════════
     XÓA SẢN PHẨM KHỎI GIỎ HÀNG
  ═══════════════════════════════════════════════════════ */
  async removeCartItem(userId: number, cartItemId: number) {
    try {
      const cartItem = await this.prisma.cartItems.findUnique({
        where  : { CartItemId: cartItemId },
        include: { Carts: true },
      });

      if (!cartItem) throw new NotFoundException('Không tìm thấy sản phẩm trong giỏ hàng');
      if (cartItem.Carts.UserId !== userId) {
        throw new ForbiddenException('Bạn không có quyền xóa sản phẩm này');
      }

      await this.prisma.cartItems.delete({ where: { CartItemId: cartItemId } });

      this.logger.log(`CartItem ${cartItemId} removed by userId=${userId}`);
      return { message: 'Xóa sản phẩm khỏi giỏ hàng thành công' };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  /* ─── Placeholder routes ─── */
  findAll()  { return 'This action returns all cart'; }
  findOne(id: number) { return `This action returns a #${id} cart`; }
  update(id: number, _dto: UpdateCartDto) { return `This action updates a #${id} cart`; }
  remove(id: number) { return `This action removes a #${id} cart`; }
}
