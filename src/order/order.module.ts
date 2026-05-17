import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';

import { PaymentModule } from 'src/payment/payment.module';
import { OrderCleanupService } from './order-cleanup.service';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  imports: [PaymentModule, NotificationModule],
  controllers: [OrderController],
  providers: [OrderService, OrderCleanupService],
})
export class OrderModule {}
