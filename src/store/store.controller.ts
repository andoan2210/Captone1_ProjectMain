import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Request,
  UseGuards,
  Query,
  UseInterceptors,
  UploadedFile,
  ParseIntPipe,
} from '@nestjs/common';
import { StoreService } from './store.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { JwtAuthGuard } from 'src/auth/passport/jwt-auth.guard';
import { RolesGuard } from 'src/auth/passport/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/auth/enums/role.enum';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('store')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SHOP_OWNER)
  @Get('me')
  getMyStore(@Request() req) {
    return this.storeService.getMyStore(req.user.userId);
  }

  @UseInterceptors(FileInterceptor('logo'))
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SHOP_OWNER)
  @Patch('me')
  updateMyStore(
    @Request() req,
    @Body() updateStoreDto: UpdateStoreDto,
    @UploadedFile() logo: Express.Multer.File,
  ) {
    return this.storeService.updateMyStore(
      req.user.userId,
      updateStoreDto,
      logo,
    );
  }
  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Request() req, @Body() createStoreDto: CreateStoreDto) {
    return this.storeService.create(req.user.userId, createStoreDto);
  }
  
  @Get('getshopbyproduct/:productId')
  getStoreByProduct(@Param('productId') productId: number) {
    return this.storeService.getStoreByProduct(productId);
  }

  // =============================================
  // ADMIN — Duyệt đơn đăng ký cửa hàng
  // =============================================

  @Get('admin/pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  getPendingStores() {
    return this.storeService.getPendingStores();
  }

  @Patch('admin/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  approveStore(@Param('id', ParseIntPipe) id: number) {
    return this.storeService.approveStore(id);
  }

  @Patch('admin/:id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  rejectStore(@Param('id', ParseIntPipe) id: number) {
    return this.storeService.rejectStore(id);
  }

  @Get()
  findAll() {
    return this.storeService.findAll();
  }

  @Get('top-store')
  getTopStore(@Query('limit') limit: number) {
    const limitNumber = Number(limit) || 5;
    return this.storeService.getStoreByBest(limitNumber);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.storeService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateStoreDto: UpdateStoreDto) {
    return this.storeService.update(+id, updateStoreDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.storeService.remove(+id);
  }
}