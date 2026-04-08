import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { dmmfToRuntimeDataModel } from '@prisma/client/runtime/library';
import { throwError } from 'rxjs';
import { PreviewDto } from './dto/preview.dto';
import { PaymentFactory } from 'src/payment/payment.factory';
import { Logger } from '@nestjs/common';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentFactory: PaymentFactory,
  ) {}

  async createOrder(userId: number, dto: CreateOrderDto) {
    this.logger.log(`[CreateOrder] Bắt đầu tạo đơn hàng mới cho UserId: ${userId}`);
    try {
      const resultData = await this.prisma.$transaction(async (tx) => {
        let itemsInfo: any[] = [];
        let total = 0;
        let storeId: number | null = null;

        if (dto.type === 'CART') {
          if (!dto.selectedItems?.length) throw new Error('No items selected');

          const cartItems = await tx.cartItems.findMany({
            where: {
              Carts: { UserId: userId },
              CartItemId: { in: dto.selectedItems },
            },
            include: {
              ProductVariants: { include: { Products: true } },
            },
          });

          if (!cartItems.length) throw new Error('Cart items not found');

          // Check store id sau dung voucher
          storeId = cartItems[0].ProductVariants.Products.StoreId;
          const hasMultipleStores = cartItems.some(i => i.ProductVariants.Products.StoreId !== storeId);
          if (hasMultipleStores) {
             throw new Error('Vui lòng chọn các sản phẩm trong cùng một Shop để đặt hàng!');
          }

          itemsInfo = cartItems.map(i => ({
            variantId: i.ProductVariants.VariantId,
            productId: i.ProductVariants.ProductId,
            price: i.ProductVariants.Price ?? i.ProductVariants.Products.Price,
            quantity: i.Quantity,
          }));
        } else if (dto.type === 'BUY_NOW') {
          if (!dto.variantId || !dto.quantity) throw new Error('Missing variant or quantity');

          const variant = await tx.productVariants.findUnique({
            where: { VariantId: dto.variantId },
            include: { Products: true },
          });

          if (!variant) throw new Error('Variant not found');
          storeId = variant.Products.StoreId;

          itemsInfo = [{
            variantId: variant.VariantId,
            productId: variant.ProductId,
            price: variant.Price ?? variant.Products.Price,
            quantity: dto.quantity,
          }];
        }

        // UPDATE FOR STOCK 
        for (const item of itemsInfo) {
          const itemTotal = Number(item.price) * item.quantity;
          total += itemTotal;
            // lam theo kieu update de tranh loi race condition
          const updateStock = await tx.productVariants.updateMany({
            where: {
              VariantId: item.variantId,
              Stock: { gte: item.quantity }, 
            },
            data: { Stock: { decrement: item.quantity } },
          });

          if (updateStock.count === 0) {
            throw new Error(`Sản phẩm (Variant ID: ${item.variantId}) đã hết hàng hoặc không đủ số lượng.`);
          }
        }

        // UPDATE FOR VOUCHER
        let discount = 0;
        let appliedVoucherId: number | null = null;
        if (dto.voucherCode) {
          const voucher = await tx.vouchers.findUnique({ where: { Code: dto.voucherCode } });
          if (!voucher || !voucher.IsActive) throw new Error('Voucher không hợp lệ');
          if (voucher.ExpiredDate && voucher.ExpiredDate < new Date()) throw new Error('Voucher đã hết hạn');
          if (voucher.StoreId !== storeId) throw new Error('Voucher không áp dụng cho shop này');

          const updateVoucher = await tx.vouchers.updateMany({
            where: {
              VoucherId: voucher.VoucherId,
              Quantity: { gte: 1 },
            },
            data: { Quantity: { decrement: 1 } },
          });

          if (updateVoucher.count === 0) {
            throw new Error('Voucher đã hết lượt sử dụng');
          }

          appliedVoucherId = voucher.VoucherId;
          const discountPercent = voucher.DiscountPercent || 0;
          discount = (total * discountPercent) / 100;
        }

        const finalTotal = total - discount + 30000;

        // GET ADDRESS
        const address = await tx.userAddresses.findUnique({
          where: { AddressId: dto.addressId, UserId: userId }
        });
        if (!address) throw new Error('Địa chỉ không hợp lệ');

        const shippingAddressString = `${address.FullName}, ${address.Phone} - ${address.DetailAddress}, ${address.Ward}, ${address.District}, ${address.Province}`;

        //  INSERT ORDER
        const newOrder = await tx.orders.create({
          data: {
            UserId: userId,
            StoreId: storeId!,
            TotalAmount: finalTotal,
            OrderStatus: 'Pending',
            PaymentStatus: 'Unpaid',
            ShippingAddress: shippingAddressString,
            AddressId: address.AddressId,
          },
        });

        //  INSERT ORDER ITEMS
        await tx.orderItems.createMany({
          data: itemsInfo.map(item => ({
            OrderId: newOrder.OrderId,
            VariantId: item.variantId,
            Quantity: item.quantity,
            UnitPrice: item.price,
          })),
        });

        //  INSERT ORDER VOUCHER
        if (appliedVoucherId) {
          await tx.orderVouchers.create({
            data: {
              OrderId: newOrder.OrderId,
              VoucherId: appliedVoucherId,
            },
          });
        }

        // tao payment record cho thanh toan
        const paymentRecord = await tx.payments.create({
          data: {
            OrderId: newOrder.OrderId,
            PaymentMethod: dto.paymentMethod, 
            Amount: finalTotal,
            Status: 'Pending',
          },
        });

        // xao cart
        if (dto.type === 'CART' && dto.selectedItems) {
          const cart = await tx.carts.findUnique({ where: { UserId: userId } });
          if (cart) {
            await tx.cartItems.deleteMany({
              where: {
                CartId: cart.CartId,
                CartItemId: { in: dto.selectedItems },
              },
            });
          }
        }

        return {
          message: 'Đặt hàng thành công',
          order: newOrder,
          payment: paymentRecord,
        };
      });

      let payUrl: string | undefined;

      if (dto.paymentMethod === 'MOMO') {
        this.logger.log(`[CreateOrder] Kích hoạt thanh toán MoMo cho OrderId: ${resultData.order.OrderId}...`);
        const strategy = this.paymentFactory.get('MOMO');
        if (strategy) {
          const paymentResult = await strategy.createPayment({
            orderId: resultData.order.OrderId,
            amount: Number(resultData.order.TotalAmount),
          });
          payUrl = paymentResult.payUrl;
          this.logger.log(`[CreateOrder] Sinh thành công Link thanh toán MoMo cho OrderId: ${resultData.order.OrderId}`);
        }
      }

      return {
        ...resultData,
        payUrl,
      };

    } catch (error) {
      this.logger.error(`[CreateOrder Error] Lỗi khi tạo đơn hàng: ${error.message}`);
      throw new Error(error.message || 'Tạo đơn hàng thất bại');
    }
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
          OrderVouchers: {
            include: {
              Vouchers: true,
            },
          },
          Payments: true,
          Invoices: true,
        },
        
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      } 

      const voucher = order.OrderVouchers[0]?.Vouchers;

      const discountPercent = voucher?.DiscountPercent || 0;
      const subTotal = order.OrderItems.reduce((sum, item) => {
        return sum + Number(item.UnitPrice) * item.Quantity;
      }, 0);

      const discountAmount = (subTotal * discountPercent) / 100;

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

      subTotal,
      discountPercent,
      discountAmount,

      totalAmount: order.TotalAmount, 

      voucher: voucher
        ? {
            code: voucher.Code,
            discountPercent: voucher.DiscountPercent,
      }
      : null,

      payment: order.Payments[0]
        ? {
            method: order.Payments[0].PaymentMethod,
            status: order.Payments[0].Status,
            transactionCode: order.Payments[0].TransactionCode,
          }
        : null,

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
    this.logger.log(`[CancelOrder] UserId ${userId} yêu cầu hủy OrderId ${orderId}`);
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
          this.logger.log(`[CancelOrder] Đã hủy đơn hàng OrderId ${orderId} (Chưa thanh toán)`);
          return { message: 'Cancelled (no payment)' };
        }

        // đã thanh toán , Refund momo
        this.logger.log(`[CancelOrder] Đơn OrderId ${orderId} ĐÃ THANH TOÁN. Đang tiến hành gọi Refund sang: ${payment.PaymentMethod}...`);
        const strategy = this.paymentFactory.get(payment.PaymentMethod);
        if (!strategy || !strategy.refund) {
          throw new BadRequestException('Phương thức thanh toán này không hỗ trợ hoàn tiền tự động');
        }

        const refundRes = await strategy.refund({
          orderId: order.OrderId,
          amount: Number(order.TotalAmount),
          transId: payment.TransactionCode!,
        });

        if (refundRes.resultCode !== 0) {
          throw new BadRequestException('Refund failed from MoMo: ' + refundRes.message);
        }

        // refund success, + stock
        for (const item of order.OrderItems) {
          await tx.productVariants.update({
            where: { VariantId: item.VariantId },
            data: {
              Stock: { increment: item.Quantity },
            },
          });
        }

        // update payment
        await tx.payments.update({
          where: { PaymentId: payment.PaymentId },
          data: {
            Status: 'Failed', // Đổi về Failed vì SQL DB Constraint của bảng Payment không cho phép chữ "Refunded"
            PaymentDate: new Date(),
          },
        });

        // update order
         await tx.orders.update({
           where: { OrderId : orderId },
           data: {
             OrderStatus: 'Cancelled',
             PaymentStatus: 'Refunded',
           },
         });

        this.logger.log(`[CancelOrder] Đã HỦY ĐƠN & HOÀN TIỀN thành công cho OrderId ${orderId}`);
        return { message: 'Refund success' };
      }, {
        timeout: 20000, 
      });

    } catch (error) {
      this.logger.error(`[CancelOrder Error] Lỗi khi hủy đơn hàng: ${error.message}`);
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


  async preview(userId: number, dto: PreviewDto) {
    try {
      let items: any[] = [];
      let total = 0;

      // CART FLOW
    if (dto.type === 'CART') {
      if (!dto.selectedItems?.length) {
        throw new Error('No items selected');
      }

      const cartItems = await this.prisma.cartItems.findMany({
        where: {
          Carts: { UserId: userId },
          CartItemId: { in: dto.selectedItems },
        },
        include: {
          ProductVariants: {
            include: {
              Products: true,
            },
          },
        },
      });

      if (!cartItems.length) {
        throw new Error('Cart items not found');
      }

      items = cartItems.map(i => {
        const price = i.ProductVariants.Price ?? i.ProductVariants.Products.Price;

        // CHECK STOCK
        if (i.ProductVariants.Stock < i.Quantity) {
          throw new Error(
            `Product ${i.ProductVariants.Products.ProductName} out of stock`,
          );
        }

        const itemTotal = Number(price) * i.Quantity;
        total += itemTotal;

        return {
          variantId: i.ProductVariants.VariantId,
          productImage : i.ProductVariants.Products.ThumbnailUrl,
          productName: i.ProductVariants.Products.ProductName,
          price,
          quantity: i.Quantity,
          total: itemTotal,
          stock: i.ProductVariants.Stock,
        };
      });
      }

    //  BUY NOW 
    if (dto.type === 'BUY_NOW') {
      if (!dto.variantId || !dto.quantity) {
        throw new Error('Missing variantId or quantity');
      }

      const variant = await this.prisma.productVariants.findUnique({
        where: { VariantId: dto.variantId },
        include: { Products: true },
      });

      if (!variant) throw new Error('Variant not found');

      if (variant.Stock < dto.quantity) {
        throw new Error('Out of stock');
      }

      const price = variant.Price ?? variant.Products.Price;
      total = Number(price) * dto.quantity;

      items = [
        {
          variantId: variant.VariantId,
          productName: variant.Products.ProductName,
          productImage : variant.Products.ThumbnailUrl,
          price,
          quantity: dto.quantity,
          total,
          stock: variant.Stock,
        },
      ];
    }

    // GET VOUCHER
    let discount = 0;
    if (dto.voucherCode) {
      const voucher = await this.prisma.vouchers.findUnique({
        where: { Code: dto.voucherCode },
      });

      if (!voucher) {
        throw new Error('Voucher is invalid');
      }

      if (!voucher.IsActive || (voucher.ExpiredDate && voucher.ExpiredDate < new Date())) {
        throw new Error('Voucher is expired or inactive');
      }

      if (voucher.Quantity <= 0) {
        throw new Error('Voucher is out of stock');
      }

      // voucher store
      const discountPercent = voucher.DiscountPercent || 0;
      discount = (total * discountPercent) / 100;
    }

    const finalTotal = total - discount + 30000;
    
    return {
      items,
      total,
      shippingFee: 30000,
      discount,
      finalTotal,
    };

  } catch (error) {
    throw new Error(error.message || 'Preview failed');
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
