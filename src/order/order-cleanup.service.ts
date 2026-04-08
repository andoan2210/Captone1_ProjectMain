import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class OrderCleanupService {
  private readonly logger = new Logger(OrderCleanupService.name);

  constructor(private prisma: PrismaService) {}

  // Chạy tự động mỗi 5 phút một lần
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleExpiredOrders() {
    this.logger.log('[Order Cleanup] Bắt đầu quét đơn hàng quá hạn (chưa thanh toán sau 15 phút)...');
    
    try {
      //  Lấy danh sách các đơn hàng ở trạng thái Pending/Unpaid hơn 15 phút trước
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      
      const expiredOrders = await this.prisma.orders.findMany({
        where: {
          OrderStatus: 'Pending',
          PaymentStatus: 'Unpaid',
          CreatedAt: { lt: fifteenMinutesAgo },
        },
        include: {
          OrderItems: true,
          OrderVouchers: true,
        },
      });

      if (expiredOrders.length === 0) {
        return;
      }

      this.logger.log(`[Order Cleanup] Tìm thấy ${expiredOrders.length} đơn hàng quá hạn. Đang tiến hành hủy và hoàn số lượng...`);

      let cancelledCount = 0;

      //  Chạy độc lập từng đơn hàng để đảm bảo an toàn Transaction
      for (const order of expiredOrders) {
        this.logger.log(`[Order Cleanup] Đang tiến hành dọn dẹp OrderId: ${order.OrderId} (Mã User: ${order.UserId})...`);
        
        await this.prisma.$transaction(async (tx) => {
          
          // Đổi trạng thái Order
          await tx.orders.update({
            where: { OrderId: order.OrderId },
            data: { 
              OrderStatus: 'Cancelled',
              PaymentStatus: 'Unpaid'
            },
          });

          // Đổi trạng thái Payment (nếu có Payment chờ)
          const updatedPayments = await tx.payments.updateMany({
            where: { OrderId: order.OrderId, Status: 'Pending' },
            data: { Status: 'Failed' },
          });

          if (updatedPayments.count > 0) {
            this.logger.log(`[Order Cleanup]  Đã hủy ${updatedPayments.count} yêu cầu thanh toán (Payment) nội bộ.`);
          }

          // Hoàn lại Tồn kho (Stock)
          for (const item of order.OrderItems) {
            await tx.productVariants.update({
              where: { VariantId: item.VariantId },
              data: { Stock: { increment: item.Quantity } },
            });
            this.logger.log(`[Order Cleanup]  Hoàn lại Stock: +${item.Quantity} sản phẩm cho VariantId ${item.VariantId}.`);
          }

          // Hoàn lại Số lượng Voucher (nếu lúc mua có xài mã)
          for (const orderVoucher of order.OrderVouchers) {
            await tx.vouchers.update({
              where: { VoucherId: orderVoucher.VoucherId },
              data: { Quantity: { increment: 1 } },
            });
            this.logger.log(`[Order Cleanup]  Hoàn lại Voucher: +1 lượt sử dụng cho VoucherId ${orderVoucher.VoucherId}.`);
          }
          
          cancelledCount++;
          this.logger.log(`[Order Cleanup]  Đã dọn xong OrderId: ${order.OrderId}!`);
        });
      }

      this.logger.log(`[Order Cleanup] Đã hủy thành công ${cancelledCount} đơn hàng và HOÀN LẠI KHO/VOUCHER hoàn tất.`);

    } catch (e) {
      this.logger.error(`[Order Cleanup Error] Lỗi khi dọn dẹp đơn hàng: ${e.message}`);
    }
  }
}
