import { Injectable } from '@nestjs/common';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { MomoIpnDto } from './dto/momo-ipn.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaymentFactory } from './payment.factory';
import { Logger } from '@nestjs/common';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(private prisma: PrismaService,
    private readonly paymentFactory: PaymentFactory,
  ) {}

  async createPayment(method: string, data) {
    const strategy = this.paymentFactory.get(method);
    if (!strategy) {
      throw new Error('Unsupported payment method');
    }
    return strategy.createPayment(data);
  }

  async handleIPN(data: MomoIpnDto) {
    this.logger.log(`[handleIPN] Nhận tín hiệu Webhook/IPN từ MoMo với mã giao dịch: ${data.orderId}`);
    return this.prisma.$transaction(async (tx) => {

      // Xác định danh sách orderIds cần xử lý
      let orderIds: number[] = [];

      // Nếu extraData chứa orderIds (batch payment) → decode
      if (data.extraData) {
        try {
          const decoded = JSON.parse(Buffer.from(data.extraData, 'base64').toString('utf-8'));
          if (decoded.orderIds && Array.isArray(decoded.orderIds)) {
            orderIds = decoded.orderIds;
          }
        } catch {
          // extraData không phải batch → bỏ qua
        }
      }

      // Fallback: lấy orderId từ MoMo orderId string (CPS_32_123456789)
      if (!orderIds.length) {
        const parts = data.orderId.split('_');
        const oid = Number(parts[1] || data.orderId);
        if (oid) orderIds = [oid];
      }

      if (!orderIds.length) return;

      // Thanh toán thất bại → cập nhật tất cả payments
      if (data.resultCode !== 0) {
        this.logger.warn(`[handleIPN] Thanh toán THẤT BẠI từ MoMo (ResultCode: ${data.resultCode}) cho OrderIds: [${orderIds.join(', ')}]`);
        for (const orderId of orderIds) {
          await tx.payments.updateMany({
            where: { OrderId: orderId, Status: 'Pending' },
            data: { Status: 'Failed' },
          });
        }
        return;
      }

      // Thanh toán thành công → cập nhật từng order
      for (const orderId of orderIds) {
        const payment = await tx.payments.findFirst({ where: { OrderId: orderId } });
        if (!payment || payment.Status === 'Success') continue;

        await tx.payments.update({
          where: { PaymentId: payment.PaymentId },
          data: {
            Status: 'Success',
            TransactionCode: data.transId.toString(),
            PaymentDate: new Date(),
          },
        });

        await tx.orders.update({
          where: { OrderId: orderId },
          data: { PaymentStatus: 'Paid', OrderStatus: 'Confirmed' },
        });

        const order = await tx.orders.findUnique({
          where: { OrderId: orderId },
          include: { UserAddresses: true, Users: true },
        });

        await tx.invoices.create({
          data: {
            OrderId: orderId,
            PaymentId: payment.PaymentId,
            TotalAmount: payment.Amount,
            BillingName: order?.Users?.FullName || 'Unknown',
            BillingAddress: order?.ShippingAddress || 'Unknown',
            BillingPhone: order?.Users?.Phone || 'Unknown',
            InvoiceNumber: `INV-${orderId}-${Date.now()}`,
          },
        });

        this.logger.log(`[handleIPN] Hoàn tất cập nhật OrderId ${orderId} → Paid. Xuất hóa đơn thành công.`);
      }

      this.logger.log(`[handleIPN] Đã xử lý xong ${orderIds.length} đơn hàng từ 1 giao dịch MoMo.`);
    });
  }
}
