import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { SearchProductDto } from './dto/search-product.dto';
import { GetSuggestionDto } from './dto/get-suggestion.dto';
import { JwtAuthGuard } from 'src/auth/passport/jwt-auth.guard';
import { RolesGuard } from 'src/auth/passport/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/auth/enums/role.enum';
import { FileFieldsInterceptor } from '@nestjs/platform-express';

@Controller('product')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SHOP_OWNER)
  @Post()
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'thumbnail', maxCount: 1 },
      { name: 'images', maxCount: 10 },
    ]),
  )
  create(
    @Req() req,
    @Body() createProductDto: CreateProductDto,
    @UploadedFiles()
    files: {
      thumbnail?: Express.Multer.File[];
      images?: Express.Multer.File[];
    },
  ) {
    return this.productService.create(req.user.userId, createProductDto, files);
  }

  @Get()
  findAll() {
    return this.productService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SHOP_OWNER)
  @Get('my-products')
  getMyProducts(@Req() req , @Query('page') page?: string, @Query('limit') limit?: string) {
    const pageNumber = parseInt(page || '1', 10);
    const limitNumber = parseInt(limit || '5', 10);
    return this.productService.getMyProducts(req.user.userId, pageNumber, limitNumber);
  }
  
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SHOP_OWNER)
  @Patch(':id')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'thumbnail', maxCount: 1 },
      { name: 'images', maxCount: 10 },
    ]),
  )
  update(
    @Req() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProductDto: UpdateProductDto,
    @UploadedFiles()
    files: {
      thumbnail?: Express.Multer.File[];
      images?: Express.Multer.File[];
    },
  ) {
    return this.productService.update(
      req.user.userId,
      id,
      updateProductDto,
      files,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SHOP_OWNER)
  @Delete(':id')
  remove(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.productService.remove(req.user.userId, id);
  }

  @Get('detail/:id')
  getDetailProduct(@Param('id') id: number) {
    return this.productService.getDetailProduct(id);
  }

  @Get('new')
  getNewProduct(@Query('limit') limit: number) {
    const limitNumber = limit || 5;
    return this.productService.getNewProduct(limitNumber);
  }

  @Get('best-seller')
  getBestSellerProduct(@Query('limit') limit: number) {
    const limitNumber = limit || 5;
    return this.productService.getBestSellerProduct(limitNumber);
  }

  @Get('category-product')
  getByCategory(
    @Query('categoryId') categoryId: number,
    @Query('page') page: number,
    @Query('limit') limit: number,
  ) {
    const limitNumber = limit || 5;
    const pageNumber = page || 1;
    return this.productService.getByCategory(categoryId, pageNumber, limitNumber);
  }

  @Get('product-shop/:shopId')
  getProductByShopId(@Param('shopId') shopId: number , @Query('limit') limit: number) {
    const limitNumber = limit || 5;
    return this.productService.getProductShop(Number(shopId), limitNumber);
  }

  @Get('search')
  searchProducts(@Query() searchDto: SearchProductDto) {
    return this.productService.searchProducts(searchDto);
  }

  @Get('suggestions')
  getSuggestions(@Query() suggestDto: GetSuggestionDto) {
    return this.productService.getSuggestions(suggestDto.keyword || '');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productService.findOne(+id);
  }
}