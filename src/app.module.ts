import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule , ConfigService } from '@nestjs/config';
import { UsersModule } from './users/users.module';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import redisConfig, { mailConfig } from './config/env.config';
import { RedisModule } from './shared/redis.module';
import { UploadModule } from './upload/upload.module';
import { StoreModule } from './store/store.module';
import { ProductModule } from './product/product.module';
import { CartModule } from './cart/cart.module';
import { OrderModule } from './order/order.module';
import { PaymentModule } from './payment/payment.module';
import { VoucherModule } from './voucher/voucher.module';
import { ChatModule } from './chat/chat.module';
import { NotificationModule } from './notification/notification.module';
import { AirecommendationModule } from './airecommendation/airecommendation.module';
import { ReportModule } from './report/report.module';
import { AddressModule } from './address/address.module';
import { PaymentMethodModule } from './payment-method/payment-method.module';
@Module({
  imports: [
    PrismaModule,
    RedisModule,
    ConfigModule.forRoot({ isGlobal: true, load: [redisConfig,mailConfig] }),
    UsersModule, 
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get('NODE_ENV') === 'production';
        return {
          pinoHttp: {
            transport: isProduction
              ? undefined
              : { target: 'pino-pretty', options: { singleLine: true } },
            level: isProduction ? 'info' : 'debug',
          },
        };
      },
      inject: [ConfigService],
    }),
    AuthModule,
    MailModule,
    UploadModule,
    StoreModule,
    ProductModule,
    CartModule,
    OrderModule,
    PaymentModule,
    VoucherModule,
    ChatModule,
    NotificationModule,
    AirecommendationModule,
    ReportModule,
    AddressModule,
    PaymentMethodModule,   
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
