import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { dmmfToRuntimeDataModel } from '@prisma/client/runtime/library';
import { throwError } from 'rxjs';

@Injectable()
export class OrderService {
  constructor(private readonly prisma: PrismaService) {}

  create(createOrderDto: CreateOrderDto) {
    return 'This action adds a new order';
  }
  async getOrderForShop(userId : number){
    try{
      const store = await this.prisma.users.findFirst({
      where: {
        UserId: userId,
        IsActive :true,
      },
      select :{
        Stores :{
          select:{
            StoreId : true,
          }
        }
      }
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const orders = await this.prisma.orders.findMany({
      where: {
        StoreId: store.Stores?.StoreId,
      },
      select :{
        OrderId : true,
        TotalAmount :true,
        OrderStatus : true,
        PaymentStatus : true,
        CreatedAt : true,
        Users :{
          select :{
            FullName : true,
          },
        },
        OrderItems :{
          select :{
            ProductVariants :{
              select :{
                Products :{
                  select :{
                    ProductName : true,
                  },
                },
              },
            },
          },
        },
      }
    });

    const result = orders.map(order => ({
      orderId: order.OrderId,
      totalAmount: order.TotalAmount,
      orderStatus: order.OrderStatus,
      paymentStatus: order.PaymentStatus,
      createdAt: order.CreatedAt,
      user: order.Users,
      products: [
        ...new Set(
          order.OrderItems.map(
            item => item.ProductVariants?.Products?.ProductName
          )
        ),
      ],
    }));

    return {
      message: 'Get order for shop successfully',
      data: {
        order : result
      },
    };
    }catch(error){
      console.log(error);
      throw error;
    }
    
  }


  async getOrderDetail(userId: number, orderId: number) {
    try {
      const order = await this.prisma.orders.findFirst({
        where: {
          OrderId: orderId,
          UserId: userId, 
        },
        include: {
          OrderItems: {
            include: {
              ProductVariants: {
                include: {
                  Products: true,
                },
              },
            },
          },
          Payments: true,
          Invoices: true,
        },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      } 

      const items = order.OrderItems.map(i => {
      const product = i.ProductVariants.Products;

        return {
          productName: product.ProductName,
          variant: `${i.ProductVariants.Size} - ${i.ProductVariants.Color}`,
          quantity: i.Quantity,
          price: i.UnitPrice,
          total: Number(i.UnitPrice) * i.Quantity,
      };
    });

    return {
      orderId: order.OrderId,
      orderStatus: order.OrderStatus,
      paymentStatus: order.PaymentStatus,

      shippingAddress: order.ShippingAddress,

      items,

      payment: order.Payments[0]
        ? {
            method: order.Payments[0].PaymentMethod,
            status: order.Payments[0].Status,
            transactionCode: order.Payments[0].TransactionCode,
          }
        : null,

      totalAmount: order.TotalAmount,
      createdAt: order.CreatedAt,

      invoice: order.Invoices
        ? {
          invoiceId: order.Invoices.InvoiceId,
          invoiceNumber: order.Invoices.InvoiceNumber,
        }
        : null,
    };

    } catch (error) {
      throw new NotFoundException(error.message || 'Get order failed');
    }
  }


  async cancelOrder(userId: number,orderId: number) {
    try {
      return await this.prisma.$transaction(async (tx) => {

        const order = await tx.orders.findFirst({
          where: { OrderId: orderId ,
                  UserId: userId,
           },
          include: { Payments: true, OrderItems: true },
        });

        if (!order) throw new NotFoundException('Order not found');

        if (!['Pending', 'Confirmed'].includes(order.OrderStatus)) {
          throw new BadRequestException('Cannot cancel this order');
        }
          
        const payment = order.Payments.find(p => p.Status === 'Success');

        // chưa thanh toán
        if (!payment) {
          await tx.orders.update({
            where: { OrderId: orderId },
            data: { OrderStatus: 'Cancelled',
                    PaymentStatus: 'Unpaid',
             },
          });

          return { message: 'Cancelled (no payment)' };
        }

        // đã thanh toán , Refund momo
        // const refundRes = await this.momoService.refund({
        //   orderId: order.orderId,
        //   amount: order.totalAmount,
        //   transId: payment.transactionCode,
        // });

        // if (refundRes.resultCode !== 0) {
        //   throw new AppException('Refund failed from MoMo');
        // }

        // refund success, + stock
        // for (const item of order.OrderItems) {
        //   await tx.productVariants.update({
        //     where: { VariantId: item.VariantId },
        //     data: {
        //       Stock: { increment: item.Quantity },
        //     },
        //   });
        // }

        // update payment
        // await tx.payments.update({
        //   where: { PaymentId: payment.PaymentId },
        //   data: {
        //     Status: 'Refunded',
        //   },
        // });

        // update order
        //  await tx.orders.update({
        //    where: { OrderId : orderId },
        //    data: {
        //      OrderStatus: 'Cancelled',
        //      PaymentStatus: 'Refunded',
        //    },
        //  });

        return { message: 'Refund success' };
      });

    } catch (error) {
      throw new NotFoundException(error.message || 'Cancel failed');
    }
  }


  async getInvoice(userId: number, invoiceId: number) {
    try {
      const invoice = await this.prisma.invoices.findUnique({
        where: {
          InvoiceId: invoiceId,
          Orders: { UserId: userId }, 
        },
        include: {
          Orders: {
            include: {
              OrderItems: {
                include: {
                ProductVariants: {
                  include: {
                    Products: true,
                  },
                },
              },
            },
            Payments: true,
          },
        },
      },
    });

      if (!invoice || invoice.Orders?.UserId !== userId) throw new NotFoundException('Invoice not found');
      if (!invoice.Orders) {
            throw new NotFoundException('Order not found');
      }

      const order = invoice.Orders;

      const items = order.OrderItems.map(i => ({
        productName: i.ProductVariants.Products.ProductName,
        variant: `${i.ProductVariants.Size} - ${i.ProductVariants.Color}`,
        quantity: i.Quantity,
        unitPrice: i.UnitPrice,
        total: Number(i.UnitPrice) * i.Quantity,
      }));

      const payment = order.Payments.find(p => p.Status === 'Success');

      return {
        invoiceId: invoice.InvoiceId,
        invoiceNumber: invoice.InvoiceNumber,
        issueDate: invoice.IssueDate,

        customer: {
          name: invoice.BillingName,
          phone: invoice.BillingPhone,
          address: invoice.BillingAddress,
        },

        order: {
          orderId: order.OrderId,
        },

        items,

        payment: payment
          ? {
            method: payment.PaymentMethod,
            transactionCode: payment.TransactionCode,
            status: payment.Status,
            paidAt: payment.PaymentDate,
          }
        : null,

        totalAmount: invoice.TotalAmount,
      };

    } catch (error) {
      throw new NotFoundException(error.message || 'Get invoice failed');
    }
  }


  findAll() {
    return `This action returns all order`;
  }

  findOne(id: number) {
    return `This action returns a #${id} order`;
  }

  update(id: number, updateOrderDto: UpdateOrderDto) {
    return `This action updates a #${id} order`;
  }

  remove(id: number) {
    return `This action removes a #${id} order`;
  }
}
