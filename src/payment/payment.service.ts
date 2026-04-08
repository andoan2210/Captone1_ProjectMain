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

      // MoMo trả về orderId có dạng CPS_32_123456789. Ta cắt chuỗi để lấy số 32 ở giữa.
      const parts = data.orderId.split('_');
      const orderId = Number(parts[1] || data.orderId);

      const payment = await tx.payments.findFirst({
        where: { OrderId: orderId },
      });

      if (!payment) return;

      //  
      if (payment.Status === 'Success') return;

      if (data.resultCode !== 0) {
        this.logger.warn(`[handleIPN] Thanh toán THẤT BẠI từ MoMo cho OrderId ${orderId} (ResultCode: ${data.resultCode})`);
        await tx.payments.update({
          where: { PaymentId: payment.PaymentId },
          data: { Status: 'Failed' },
        });
        return;
      }


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
        data: {
          PaymentStatus: 'Paid',
          OrderStatus: 'Confirmed',
        },
      });

      const order = await tx.orders.findUnique({
        where: { OrderId: orderId },
        include: {
          UserAddresses: true,
          Users: true,
        },
      });
      const invoice = await tx.invoices.create({
        data: {
          OrderId: orderId,
          PaymentId: payment.PaymentId,
          TotalAmount: payment.Amount,
          BillingName: order?.Users?.FullName || 'Unknown',
          BillingAddress: order?.ShippingAddress || 'Unknown',
          BillingPhone : order?.Users?.Phone || 'Unknown',
          InvoiceNumber: `INV-${Date.now()}`,
        },
      });

      this.logger.log(`[handleIPN] Hoàn tất cập nhật DB. Đơn hàng ${orderId} đã báo Paid. Xuất hóa đơn: ${invoice.InvoiceNumber}`);
    });
  }
}
