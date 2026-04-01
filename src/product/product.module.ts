import { Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { UploadModule } from 'src/upload/upload.module';

@Module({
  imports: [UploadModule],
  controllers: [ProductController],
  providers: [ProductService],
  exports : [ProductService],
})
export class ProductModule {}
