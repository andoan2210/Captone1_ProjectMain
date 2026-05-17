import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { PaymentFactory } from './payment.factory';
import { ConfigModule } from '@nestjs/config';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, PaymentFactory],
  imports: [ConfigModule, NotificationModule],
  exports: [PaymentService, PaymentFactory],
})
export class PaymentModule {}
