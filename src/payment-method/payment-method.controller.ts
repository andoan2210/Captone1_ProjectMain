import { Controller, Get, Post, Body, Patch, Param, Delete, Request, UseGuards } from '@nestjs/common';
import { PaymentMethodService } from './payment-method.service';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { JwtAuthGuard } from 'src/auth/passport/jwt-auth.guard';

@Controller('payment-method')
export class PaymentMethodController {
  constructor(private readonly paymentMethodService: PaymentMethodService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Request() req,@Body() createPaymentMethodDto: CreatePaymentMethodDto) {
    return this.paymentMethodService.create(req.user.userId,createPaymentMethodDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Request() req) {
    return this.paymentMethodService.findAll( req.user.userId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Request() req,@Param('id') id: string) {
    return this.paymentMethodService.findOne(req.user.userId,+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(@Request() req,@Param('id') id: string, @Body() updatePaymentMethodDto: UpdatePaymentMethodDto) {
    return this.paymentMethodService.update(req.user.userId,+id, updatePaymentMethodDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Request() req,@Param('id') id: string) {
    return this.paymentMethodService.remove(req.user.userId,+id);
  }
}
