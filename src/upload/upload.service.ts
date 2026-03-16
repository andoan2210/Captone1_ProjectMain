import { Injectable, BadRequestException } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';

@Injectable()
export class UploadService {

  private s3: S3Client;
  private bucket: string;
  private publicUrl: string;

  constructor(private configService: ConfigService) {

    this.bucket = this.configService.get<string>('AWS_BUCKET_NAME')!;
    this.publicUrl = this.configService.get<string>('AWS_PUBLIC_URL')!;

    this.s3 = new S3Client({
      region: this.configService.get<string>('AWS_REGION')!,
      endpoint: `https://s3.${this.configService.get<string>('AWS_REGION')}.amazonaws.com`,
      forcePathStyle: false,
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID')!,
        secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY')!,
      },
    });
  }

  // validate file
  private validateImage(file: Express.Multer.File) {

    const allowedTypes = ['image/jpeg','image/png','image/webp'];

    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid image type');
    }

    if (file.size > 2 * 1024 * 1024) {
      throw new BadRequestException('File too large (max 2MB)');
    }
  }

  // upload single image
  async uploadImage(
    file: Express.Multer.File,
    folder: string,
  ): Promise<string> {

    this.validateImage(file);

    const fileName = `${folder}/${Date.now()}-${file.originalname}`;

    const buffer = await sharp(file.buffer)
      .resize(1024,1024,{fit:'inside'})
      .toBuffer();

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: fileName,
      Body: buffer,
      ContentType: file.mimetype,
    });

    await this.s3.send(command);

    return `${this.publicUrl}/${fileName}`;
  }

  // upload multiple images
  async uploadMultipleImages(
    files: Express.Multer.File[],
    folder: string,
  ): Promise<string[]> {

    const urls: string[] = [];

    for(const file of files){
      const url = await this.uploadImage(file,folder);
      urls.push(url);
    }

    return urls;
  }

  // delete image from S3
  async deleteFile(fileUrl: string){

    if(!fileUrl) return;

    const key = fileUrl.replace(`${this.publicUrl}/`,'');

    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.s3.send(command);
  }
}