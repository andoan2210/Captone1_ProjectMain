import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { CreateCartDto } from './dto/create-cart.dto';
import { UpdateCartDto } from './dto/update-cart.dto';
import { JwtAuthGuard } from 'src/auth/passport/jwt-auth.guard';

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  // POST /cart/add-to-cart  — Thêm sản phẩm vào giỏ hàng
  @Post('add-to-cart')
  @UseGuards(JwtAuthGuard)
  create(@Request() req, @Body() createCartDto: CreateCartDto) {
    return this.cartService.addToCart(req.user.userId, createCartDto);
  }

  // GET /cart/my-cart  — Lấy giỏ hàng của user đang đăng nhập (kèm thông tin sản phẩm + tổng tiền)
  @Get('my-cart')
  @UseGuards(JwtAuthGuard)
  getMyCart(@Request() req) {
    return this.cartService.getCartByUserId(req.user.userId);
  }

  // PATCH /cart/update-item/:cartItemId  — Cập nhật số lượng sản phẩm trong giỏ hàng
  @Patch('update-item/:cartItemId')
  @UseGuards(JwtAuthGuard)
  updateItem(
    @Request() req,
    @Param('cartItemId', ParseIntPipe) cartItemId: number,
    @Body() updateCartDto: UpdateCartDto,
  ) {
    return this.cartService.updateCartItemQuantity(req.user.userId, cartItemId, updateCartDto);
  }

  // DELETE /cart/remove-item/:cartItemId  — Xóa sản phẩm khỏi giỏ hàng
  @Delete('remove-item/:cartItemId')
  @UseGuards(JwtAuthGuard)
  removeItem(@Request() req, @Param('cartItemId', ParseIntPipe) cartItemId: number) {
    return this.cartService.removeCartItem(req.user.userId, cartItemId);
  }

  // Giữ lại các route cũ (để không breaking change nếu có nơi khác gọi)
  @Get()
  findAll() {
    return this.cartService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cartService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCartDto: UpdateCartDto) {
    return this.cartService.update(+id, updateCartDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cartService.remove(+id);
  }
}
