import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { PaymentFactory } from './payment.factory';
import { ConfigModule } from '@nestjs/config';

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, PaymentFactory],
  imports : [ConfigModule],
  exports: [PaymentService, PaymentFactory],
})
export class PaymentModule {}
