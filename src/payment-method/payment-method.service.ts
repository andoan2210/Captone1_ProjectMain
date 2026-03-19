import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Logger } from 'nestjs-pino';
import { PaymentMethodType, PaymentProvider } from './enums/type.enum';

@Injectable()
export class PaymentMethodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}
  private validateTypeProvider(
    type: PaymentMethodType,
    provider: PaymentProvider,
  ) {
    if (
      type === PaymentMethodType.CARD &&
      ![PaymentProvider.VISA, PaymentProvider.MASTERCARD].includes(provider)
    ) {
      throw new BadRequestException('Invalid provider for CARD');
    }

    if (
      type === PaymentMethodType.EWALLET &&
      ![PaymentProvider.MOMO, PaymentProvider.ZALOPAY].includes(provider)
    ) {
      throw new BadRequestException('Invalid provider for EWALLET');
    }
  }

  async create(userId: number, dto: CreatePaymentMethodDto) {
    try{
         const { type, provider, accountNumber, cardHolderName, isDefault } = dto;

    this.validateTypeProvider(type, provider);

    const count = await this.prisma.userPaymentMethods.count({
      where: { UserId: userId },
    });

    const finalIsDefault = count === 0 ? true : isDefault ?? false;

    const paymentMethod = await this.prisma.$transaction(async (tx) => {
      if (finalIsDefault) {
        await tx.userPaymentMethods.updateMany({
          where: { UserId: userId },
          data: { IsDefault: false },
        });
      }
      this.logger.log('Payment method created successfully');
      return tx.userPaymentMethods.create({
        data: {
          UserId: userId,
          Type: type,
          Provider: provider,
          AccountNumber: accountNumber,
          CardHolderName: cardHolderName.trim(),
          IsDefault: finalIsDefault,
        },
      });
    });

    return {
      message: 'Payment method created successfully',
      data: {
        id: paymentMethod.PaymentMethodId,
        type: paymentMethod.Type,
        provider: paymentMethod.Provider,
        accountNumber: '****' + accountNumber.slice(-4),
        cardHolderName: paymentMethod.CardHolderName,
        isDefault: paymentMethod.IsDefault,
      },
    };
    }catch(error){
      this.logger.error('Error creating payment method', error);
      throw error;
    }
  }


  async findAll(userId: number) {
    try{
        const list = await this.prisma.userPaymentMethods.findMany({
      where: { UserId: userId },
      orderBy: [{ IsDefault: 'desc' }],
    });
    this.logger.log('Payment methods found successfully');
    return {
      message: 'Payment methods found successfully',
      data: list.map((item) => ({
        id: item.PaymentMethodId,
        type: item.Type,
        provider: item.Provider,
        accountNumber: '****' + item.AccountNumber?.slice(-4),
        cardHolderName: item.CardHolderName,
        isDefault: item.IsDefault,
      })),
    };
    }
    catch(error){
      this.logger.error('Error finding payment methods', error);
      throw error;
    }
  }


  async findOne(userId: number, id: number) {
    try{
      const item = await this.prisma.userPaymentMethods.findFirst({
      where: {
        PaymentMethodId: id,
        UserId: userId,
      },
    });

    if (!item) {
      throw new NotFoundException('Payment method not found');
    }
    this.logger.log('Payment method found successfully');
    return {
      message: 'Payment method found successfully',
      data: {
        id: item.PaymentMethodId,
        type: item.Type,
        provider: item.Provider,
        accountNumber: '****' + item.AccountNumber?.slice(-4),
        cardHolderName: item.CardHolderName,
        isDefault: item.IsDefault,
      },
    };
    }catch(error){
      this.logger.error('Error finding payment method', error);
      throw error;
    }
    
  }


  async update(userId: number, id: number, dto: UpdatePaymentMethodDto) {
    try{
          const existing = await this.prisma.userPaymentMethods.findFirst({
      where: {
        PaymentMethodId: id,
        UserId: userId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Payment method not found');
    }

    //  lấy giá trị cuối cùng (fix bug partial update)
    const finalType = dto.type ?? existing.Type as PaymentMethodType;
    const finalProvider = dto.provider ?? existing.Provider as PaymentProvider;

    this.validateTypeProvider(finalType, finalProvider);

    const updated = await this.prisma.$transaction(async (tx) => {
      // set default = true
      if (dto.isDefault === true) {
        await tx.userPaymentMethods.updateMany({
          where: { UserId: userId },
          data: { IsDefault: false },
        });
      }

      // set default = false nhưng đang là default
      if (existing.IsDefault && dto.isDefault === false) {
        const another = await tx.userPaymentMethods.findFirst({
          where: {
            UserId: userId,
            PaymentMethodId: { not: id },
          },
        });

        if (!another) {
          throw new BadRequestException(
            'Must have at least one default payment method',
          );
        }

        await tx.userPaymentMethods.update({
          where: { PaymentMethodId: another.PaymentMethodId },
          data: { IsDefault: true },
        });
      }

      return tx.userPaymentMethods.update({
        where: { PaymentMethodId: id },
        data: {
          ...(dto.type && { Type: dto.type }),
          ...(dto.provider && { Provider: dto.provider }),
          ...(dto.accountNumber && { AccountNumber: dto.accountNumber }),
          ...(dto.cardHolderName && {
            CardHolderName: dto.cardHolderName.trim(),
          }),
          ...(dto.isDefault !== undefined && {
            IsDefault: dto.isDefault,
          }),
        },
      });
    });

    return {
      message: 'Payment method updated successfully',
      data: {
        id: updated.PaymentMethodId,
        type: updated.Type,
        provider: updated.Provider,
        accountNumber: '****' + updated.AccountNumber?.slice(-4),
        cardHolderName: updated.CardHolderName,
        isDefault: updated.IsDefault,
      },
    };
    }catch(error){
      this.logger.error('Error updating payment method', error);
      throw error;
    }
  }


  async remove(userId: number, id: number) {
    try{
         const existing = await this.prisma.userPaymentMethods.findFirst({
      where: {
        PaymentMethodId: id,
        UserId: userId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Payment method not found');
    }

    await this.prisma.$transaction(async (tx) => {
      if (existing.IsDefault) {
        const another = await tx.userPaymentMethods.findFirst({
          where: {
            UserId: userId,
            PaymentMethodId: { not: id },
          },
        });

        if (!another) {
          throw new BadRequestException(
            'Must have at least one default payment method',
          );
        }

        await tx.userPaymentMethods.update({
          where: { PaymentMethodId: another.PaymentMethodId },
          data: { IsDefault: true },
        });
      }

      await tx.userPaymentMethods.delete({
        where: { PaymentMethodId: id },
      });
    });

    return {
      message: 'Payment method deleted successfully',
    };
  
    }catch(error){
      this.logger.error('Error deleting payment method', error);
      throw error;
    }
  }
}