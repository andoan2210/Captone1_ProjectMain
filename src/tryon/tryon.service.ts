import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import Fashn from 'fashn';
import { FASHN_CLIENT } from './fashn.constant';
import { UploadService } from 'src/upload/upload.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class TryonService {
    private readonly logger = new Logger(TryonService.name);
    constructor(
    @Inject(FASHN_CLIENT)
    private readonly client: Fashn,
    private readonly uploadService: UploadService,
    private readonly prisma: PrismaService,
  ) {}

    async tryon(
    userId: string,
    file: Express.Multer.File,
    productId : number,

  ) {
    try {
      const user = await this.prisma.users.findUnique({
        where: { UserId: Number(userId) },
      });

      if (!user) {
        throw new BadRequestException('User not found');
      }

      const product = await this.prisma.products.findUnique({
        where: { ProductId: Number(productId) },
      });

      if (!product) {
        throw new BadRequestException('Product not found');
      }
      // Upload file lên S3 tạm để Fashn AI đọc
      const modelUrl = await this.uploadService.uploadImage(file, 'tryon');

      try {
        // Gọi Fashn
        const response = await this.client.predictions.subscribe({
          model_name: 'tryon-v1.6',
          inputs: {
            model_image: modelUrl,
            garment_image: product.ThumbnailUrl ? product.ThumbnailUrl : '',
          },
        });

        //  Runtime error
        if (response.status !== 'completed') {
          this.logger.error('Runtime Error', {
            status: response.status,
            error: response.error?.message,
          });

          throw new BadRequestException(
            response.error?.message || 'Tryon failed',
          );
        }

        // Lưu vào DB
        await this.prisma.productTryHistory.create({
          data: {
            UserId: Number(userId),
            ProductId: Number(productId),
            TryImageUrl: String(response.output),
          },
        });

        // Success
        return {
          imageUrl: response.output,
        };
      } finally {
        // Xóa ảnh model khỏi S3 
        await this.uploadService.deleteFile(modelUrl).catch((err) =>
          this.logger.warn('Không thể xóa ảnh model khỏi S3', err),
        );
      }
    } catch (error) {
      // API error
      if (error instanceof Fashn.APIError) {
        this.logger.error('API Error', {
          status: error.status,
          message: error.message,
        });

        throw new BadRequestException(error.message);
      }

      // Unknown error
      this.logger.error('Unexpected Error', error);
      throw error;
    }
  }

  async getTryonHistory(
    userId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.productTryHistory.findMany({
        where: { UserId: Number(userId) },
        orderBy: { CreatedAt: 'desc' },
        skip,
        take: limit,
        select: {
          TryId: true,
          TryImageUrl: true,
          CreatedAt: true,
          Products: {
            select: {
              ProductId: true,
              ProductName: true,
              ThumbnailUrl: true,
              Price: true,
            },
          },
        },
      }),
      this.prisma.productTryHistory.count({
        where: { UserId: Number(userId) },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

}
