import * as crypto from 'crypto';
import axios from 'axios';
import { PaymentStrategy } from './payment.strategy';
import { ConfigService } from '@nestjs/config';

export class MomoStrategy implements PaymentStrategy {
    constructor(private config: ConfigService){}

  async createPayment({ orderId, amount }) {

    const uniqueOrderId = `CPS_${orderId}_${Date.now()}`;
    const requestId = `REQ_${uniqueOrderId}`;

    const raw = `accessKey=${this.config.get('MOMO_ACCESS_KEY')}` +
                `&amount=${amount}` +
                `&extraData=` +
                `&ipnUrl=${this.config.get('MOMO_IPN_URL')}` +
                `&orderId=${uniqueOrderId}` +
                `&orderInfo=Thanh toán đơn hàng` +
                `&partnerCode=${this.config.get('MOMO_PARTNER_CODE')}` +
                `&redirectUrl=${this.config.get('MOMO_REDIRECT_URL')}` +
                `&requestId=${requestId}` +
                `&requestType=captureWallet`;

    const signature = crypto
      .createHmac('sha256', this.config.get<string>('MOMO_SECRET_KEY')!)
      .update(raw)
      .digest('hex');

    const res = await axios.post(this.config.get<string>('MOMO_ENDPOINT')!, {
        partnerCode: this.config.get('MOMO_PARTNER_CODE'),
        partnerName: 'Test',
        storeId: 'MomoTestStore',
        requestId,
        amount,
        orderId: uniqueOrderId,
        orderInfo: 'Thanh toán đơn hàng',
        redirectUrl: this.config.get('MOMO_REDIRECT_URL'),
        ipnUrl: this.config.get('MOMO_IPN_URL'),
        lang: 'vi',
        requestType: 'captureWallet',
        autoCapture: true,
        extraData: '',
        signature,
    });

    if (res.data.resultCode !== 0) {
      throw new Error(`MoMo Error: ${res.data.message}`);
    }

    return { payUrl: res.data.payUrl };
  }

  verifySignature(data: any): boolean {
    const raw = 
                `accessKey=${this.config.get('MOMO_ACCESS_KEY')}` +
                `&amount=${data.amount}` +
                `&extraData=${data.extraData}` +
                `&message=${data.message}` +
                `&orderId=${data.orderId}` +
                `&orderInfo=${data.orderInfo}` +
                `&orderType=${data.orderType}` +
                `&partnerCode=${data.partnerCode}` +
                `&payType=${data.payType}` +
                `&requestId=${data.requestId}` +
                `&responseTime=${data.responseTime}` +
                `&resultCode=${data.resultCode}` +
                `&transId=${data.transId}`;

    const signature = crypto
      .createHmac('sha256', this.config.get<string>('MOMO_SECRET_KEY')!)
      .update(raw)
      .digest('hex');

    return signature === data.signature;
  }

  async refund({ orderId, amount, transId }: { orderId: number; amount: number; transId: string }) {
    const requestId = `refund-${orderId}-${Date.now()}`;
    const refundOrderId = `refund-${orderId}-${Date.now()}`; 

    const raw = `accessKey=${this.config.get('MOMO_ACCESS_KEY')}` +
                `&amount=${amount}` +
                `&description=Hoàn tiền đơn hàng ${orderId}` +
                `&orderId=${refundOrderId}` +
                `&partnerCode=${this.config.get('MOMO_PARTNER_CODE')}` +
                `&requestId=${requestId}` +
                `&transId=${transId}`;

    const signature = crypto
      .createHmac('sha256', this.config.get<string>('MOMO_SECRET_KEY')!)
      .update(raw)
      .digest('hex');

    const endpoint = this.config.get<string>('MOMO_ENDPOINT')!;
    const refundUrl = endpoint.replace('/api/create', '/api/refund');

    const res = await axios.post(refundUrl, {
      partnerCode: this.config.get('MOMO_PARTNER_CODE'),
      orderId: refundOrderId,
      requestId,
      amount: Number(amount),
      transId: Number(transId),
      lang: 'vi',
      description: `Hoàn tiền đơn hàng ${orderId}`,
      signature,
    });

    return res.data;
  }
}