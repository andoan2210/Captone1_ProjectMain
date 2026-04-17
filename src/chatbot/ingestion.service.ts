import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmbeddingService } from './embedding.service';
import { PineconeService } from './pinecone.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private prisma: PrismaService,
    private embedding: EmbeddingService,
    private pinecone: PineconeService,
  ) {}

  // Tự động chạy mỗi ngày vào lúc nửa đêm (00:00)
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyIngestion() {
    this.logger.log('Bắt đầu tiến trình tự động index dữ liệu sản phẩm...');
    try {
      const result = await this.indexProducts();
      this.logger.log(`Hoàn tất tự động index: ${result.message}`);
    } catch (error) {
      this.logger.error('Lỗi khi tự động index dữ liệu sản phẩm:', error);
    }
  }

  async indexProducts() {
    const products = await this.prisma.products.findMany({
      where: { IsActive: true, IsDeleted: false },
      include: {
        Categories: {
          select: { CategoryName: true },
        },
        Stores: {
          select: { StoreId: true, StoreName: true },
        },
        ProductVariants: {
          select: { Size: true, Color: true, Price: true },
        },
      },
    });

    let indexedCount = 0;

    for (const p of products) {
      const sizes = [
        ...new Set(
          p.ProductVariants.map((v) => v.Size).filter((s): s is string => Boolean(s)),
        ),
      ];
      const colors = [
        ...new Set(
          p.ProductVariants.map((v) => v.Color).filter((c): c is string => Boolean(c)),
        ),
      ];
      const prices = p.ProductVariants.map((v) => Number(v.Price));
      const minPrice = prices.length > 0 ? Math.min(...prices) : Number(p.Price);
      const maxPrice = prices.length > 0 ? Math.max(...prices) : Number(p.Price);

      const priceText =
        minPrice === maxPrice
          ? `${minPrice.toLocaleString('vi-VN')} VNĐ`
          : `${minPrice.toLocaleString('vi-VN')} - ${maxPrice.toLocaleString('vi-VN')} VNĐ`;

      const text = `
                    Tên sản phẩm: ${p.ProductName}
                    Danh mục: ${p.Categories?.CategoryName ?? 'Không có'}
                    Mô tả: ${p.Description ?? 'Không có mô tả'}
                    Giá: ${priceText}
                    Cửa hàng: ${p.Stores?.StoreName ?? 'Không có'}
                    Kích cỡ có sẵn: ${sizes.length > 0 ? sizes.join(', ') : 'Không có'}
                    Màu sắc: ${colors.length > 0 ? colors.join(', ') : 'Không có'}
      `.trim();

      const vector = await this.embedding.embed(text);

      await this.pinecone.upsert(`product-${p.ProductId}`, vector, {
        text,
        productId: p.ProductId,
        productName: p.ProductName,
        categoryName: p.Categories?.CategoryName ?? '',
        storeName: p.Stores?.StoreName ?? '',
        storeId: p.Stores?.StoreId ?? 0,
        price: Number(p.Price),
        thumbnailUrl: p.ThumbnailUrl ?? '',
        type: 'product',
      });

      indexedCount++;
    }

    return {
      message: `Đã index thành công ${indexedCount} sản phẩm lên Pinecone`,
      count: indexedCount,
    };
  }

  async removeProduct(productId: number) {
    this.logger.log(`Xoá vector của sản phẩm ${productId} khỏi Pinecone...`);
    try {
      await this.pinecone.deleteRecord(`product-${productId}`);
      return { message: `Đã xóa dữ liệu sản phẩm ID ${productId} khỏi Chatbot Index` };
    } catch (error) {
      this.logger.error(`Lỗi khi xóa vector của sản phẩm ${productId}:`, error);
      throw error;
    }
  }

  async removeAllProducts() {
    this.logger.log('Đang xóa toàn bộ dữ liệu vector trên Pinecone...');
    try {
      await this.pinecone.deleteAll();
      return { message: 'Đã dọn dẹp sạch sẽ toàn bộ database Chatbot Index' };
    } catch (error) {
      this.logger.error('Lỗi khi xóa toàn bộ dữ liệu Pinecone:', error);
      throw error;
    }
  }
}