import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { VoucherService } from './voucher.service';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { UpdateVoucherDto } from './dto/update-voucher.dto';
import { JwtAuthGuard } from 'src/auth/passport/jwt-auth.guard';
import { RolesGuard } from 'src/auth/passport/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/auth/enums/role.enum';
import { GetMyVouchersDto } from './dto/get-my-vouchers.dto';
@Controller('voucher')
export class VoucherController {
  constructor(private readonly voucherService: VoucherService) {}

  // Tạo voucher mới cho shop đang đăng nhập
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SHOP_OWNER)
  @Post()
  create(@Req() req, @Body() createVoucherDto: CreateVoucherDto) {
    return this.voucherService.create(req.user.userId, createVoucherDto);
  }

  // Lấy danh sách voucher nổi bật
  @Get('top-voucher')
  getVoucherByBest(@Query('limit') limit: number) {
    const limitNumber = Number(limit) || 5;
    return this.voucherService.getVoucherByBest(limitNumber);
  }

  // Lấy chi tiết voucher theo id
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.voucherService.findOne(id);
  }

  // Cập nhật voucher của shop đang đăng nhập
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SHOP_OWNER)
  @Patch(':id')
  update(
    @Req() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateVoucherDto: UpdateVoucherDto,
  ) {
    return this.voucherService.update(req.user.userId, id, updateVoucherDto);
  }

  // Xóa voucher của shop đang đăng nhập
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SHOP_OWNER)
  @Delete(':id')
  remove(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.voucherService.remove(req.user.userId, id);
  }

  // Lấy danh sách voucher của shop owner đang đăng nhập
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SHOP_OWNER)
@Get('my/list')
getMyVouchers(@Req() req, @Query() query: GetMyVouchersDto) {
  return this.voucherService.getMyVouchers(req.user.userId, query);
}
}