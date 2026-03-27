import { Body,Controller ,Delete ,Get,Param,Patch,Post,Query,Req, UseGuards,ParseIntPipe} from '@nestjs/common';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from 'src/auth/passport/jwt-auth.guard';
import { RolesGuard } from 'src/auth/passport/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/auth/enums/role.enum';

@Controller('product')
export class ProductController {
  constructor(private readonly productService: ProductService) {}



  @Get()
  findAll() {
    return this.productService.findAll();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productService.update(+id, updateProductDto);
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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productService.findOne(+id);
  }
}