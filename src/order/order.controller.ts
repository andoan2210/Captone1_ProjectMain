import { Controller, Get, Post, Body, Patch, Param, Delete, Request, UseGuards } from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { JwtAuthGuard } from 'src/auth/passport/jwt-auth.guard';
import { Role } from 'src/auth/enums/role.enum';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RolesGuard } from 'src/auth/passport/roles.guard';
import { PreviewDto } from './dto/preview.dto';

@Controller('order')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @Roles(Role.CLIENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  create(@Request() req, @Body() createOrderDto: CreateOrderDto) {
    return this.orderService.createOrder(req.user.userId, createOrderDto);
  }
  @Get('order-shop')
  @Roles(Role.SHOP_OWNER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  getOrderForShop(@Request() req){
    return this.orderService.getOrderForShop(req.user.userId);
  }
  

  @Get('invoice/:orderId')
  @Roles(Role.CLIENT,Role.SHOP_OWNER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  getInvoice(@Request() req, @Param('orderId') orderId: number) {
    return this.orderService.getInvoice(req.user.userId, orderId);
  }
  
  @Get('order-detail/:orderId')
  @Roles(Role.CLIENT,Role.SHOP_OWNER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  getOrderDetail(@Request() req, @Param('orderId') orderId: number) {
    return this.orderService.getOrderDetail(req.user.userId, orderId);
  }

  @Patch('cancel-order/:orderId')
  @Roles(Role.CLIENT,Role.SHOP_OWNER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  cancelOrder(@Request() req, @Param('orderId') orderId: number) {
    return this.orderService.cancelOrder(req.user.userId, orderId);
  }

  @Post('preview')
  @Roles(Role.CLIENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  preview(
    @Request() req,
    @Body() dto: PreviewDto,
  ) {
    return this.orderService.preview(req.user.userId, dto);
  }

  @Get()
  findAll() {
    return this.orderService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orderService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateOrderDto: UpdateOrderDto) {
    return this.orderService.update(+id, updateOrderDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.orderService.remove(+id);
  }
}
