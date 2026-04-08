import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { MomoIpnDto } from './dto/momo-ipn.dto';
import { PaymentFactory } from './payment.factory';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService,
    private readonly paymentFactory: PaymentFactory,
  ) {}

  @Post('ipn')
  async ipn(@Body() body: MomoIpnDto) {
    const strategy = this.paymentFactory.get('MOMO');

    if (!strategy?.verifySignature(body)) {
      return { message: 'Invalid signature' };
    }

    await this.paymentService.handleIPN(body);

    return { message: 'OK' };
  }
}
