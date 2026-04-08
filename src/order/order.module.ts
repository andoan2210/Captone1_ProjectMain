import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';

import { PaymentModule } from 'src/payment/payment.module';
import { OrderCleanupService } from './order-cleanup.service';

@Module({
  imports: [PaymentModule],
  controllers: [OrderController],
  providers: [OrderService, OrderCleanupService],
})
export class OrderModule {}
