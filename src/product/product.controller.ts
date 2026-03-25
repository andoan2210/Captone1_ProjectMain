import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Controller('product')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
    create(@Body() createProductDto: CreateProductDto) {
      return this.productService.create(createProductDto);
  }

  @Get()
  findAll() {
    return this.productService.findAll();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productService.update(+id, updateProductDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productService.remove(+id);
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
  getByCategory( @Query('categoryId') categoryId: number, @Query('page') page: number ,@Query('limit') limit: number) {
    const limitNumber = limit || 5;
    const pageNumber = page || 1;
    return this.productService.getByCategory(categoryId, pageNumber, limitNumber);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productService.findOne(+id);
  }
}
