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
    const SHIPPING_FEE = 30000;

    try {
      const resultData = await this.prisma.$transaction(async (tx) => {
        // ── GET ADDRESS ──
        const address = await tx.userAddresses.findUnique({
          where: { AddressId: dto.addressId, UserId: userId },
        });
        if (!address) throw new Error('Địa chỉ không hợp lệ');
        const shippingAddressString = `${address.FullName}, ${address.Phone} - ${address.DetailAddress}, ${address.Ward}, ${address.District}, ${address.Province}`;

        // ── BUILD ITEMS INFO (group by storeId) ──
        const storeItemsMap = new Map<number, { variantId: number; productId: number; price: any; quantity: number }[]>();

        if (dto.type === 'CART') {
          if (!dto.selectedItems?.length) throw new Error('No items selected');

          const cartItems = await tx.cartItems.findMany({
            where: {
              Carts: { UserId: userId },
              CartItemId: { in: dto.selectedItems },
            },
            include: { ProductVariants: { include: { Products: true } } },
          });
          if (!cartItems.length) throw new Error('Cart items not found');

          for (const i of cartItems) {
            const sid = i.ProductVariants.Products.StoreId;
            if (!storeItemsMap.has(sid)) storeItemsMap.set(sid, []);
            storeItemsMap.get(sid)!.push({
              variantId: i.ProductVariants.VariantId,
              productId: i.ProductVariants.ProductId,
              price: i.ProductVariants.Price ?? i.ProductVariants.Products.Price,
              quantity: i.Quantity,
            });
          }
        } else if (dto.type === 'BUY_NOW') {
          if (!dto.variantId || !dto.quantity) throw new Error('Missing variant or quantity');
          const variant = await tx.productVariants.findUnique({
            where: { VariantId: dto.variantId },
            include: { Products: true },
          });
          if (!variant) throw new Error('Variant not found');

          storeItemsMap.set(variant.Products.StoreId, [{
            variantId: variant.VariantId,
            productId: variant.ProductId,
            price: variant.Price ?? variant.Products.Price,
            quantity: dto.quantity,
          }]);
        }

        // ── CREATE ORDER PER STORE ──
        const createdOrders: any[] = [];
        let grandTotal = 0;

        for (const [storeId, items] of storeItemsMap) {
          // Trừ stock
          let subTotal = 0;
          for (const item of items) {
            subTotal += Number(item.price) * item.quantity;
            const updateStock = await tx.productVariants.updateMany({
              where: { VariantId: item.variantId, Stock: { gte: item.quantity } },
              data: { Stock: { decrement: item.quantity } },
            });
            if (updateStock.count === 0) {
              throw new Error(`Sản phẩm (Variant ID: ${item.variantId}) đã hết hàng hoặc không đủ số lượng.`);
            }
          }

          // Áp voucher cho store này
          let discount = 0;
          let appliedVoucherId: number | null = null;
          const voucherCode = dto.storeVouchers?.find(v => v.storeId === storeId)?.code
            || (storeItemsMap.size === 1 ? dto.voucherCode : undefined);

          if (voucherCode) {
            const voucher = await tx.vouchers.findUnique({
              where: { Code: voucherCode },
              include: { VoucherProducts: true }
            });

            if (!voucher || !voucher.IsActive) throw new BadRequestException(`Voucher "${voucherCode}" không hợp lệ`);
            if (voucher.ExpiredDate && voucher.ExpiredDate < new Date()) throw new BadRequestException(`Voucher "${voucherCode}" đã hết hạn`);
            if (voucher.StoreId && voucher.StoreId !== storeId) {
              throw new BadRequestException(`Voucher "${voucherCode}" không áp dụng cho shop này`);
            }

            // Tính toán tổng tiền sản phẩm hợp lệ
            let eligibleSubtotal = 0;
            if (voucher.ApplyType === 'SPECIFIC') {
              const eligibleProductIds = voucher.VoucherProducts.map(vp => vp.ProductId);
              const eligibleItems = items.filter(item => eligibleProductIds.includes(item.productId));
              eligibleSubtotal = eligibleItems.reduce((sum, item) => sum + (Number(item.price) * item.quantity), 0);

              if (eligibleSubtotal === 0) {
                throw new BadRequestException(`Voucher "${voucherCode}" không áp dụng cho các sản phẩm bạn đã chọn`);
              }
            } else {
              eligibleSubtotal = subTotal;
            }

            // Kiểm tra giá trị đơn hàng tối thiểu (trên các SP hợp lệ)
            if (voucher.MinOrderValue && Number(eligibleSubtotal) < Number(voucher.MinOrderValue)) {
              throw new BadRequestException(`Đơn hàng chưa đạt giá trị tối thiểu (${Number(voucher.MinOrderValue).toLocaleString()}đ) để sử dụng voucher này`);
            }

            const updateVoucher = await tx.vouchers.updateMany({
              where: { VoucherId: voucher.VoucherId, Quantity: { gte: 1 } },
              data: { Quantity: { decrement: 1 } },
            });
            if (updateVoucher.count === 0) throw new Error(`Voucher "${voucherCode}" đã hết lượt sử dụng`);

            appliedVoucherId = voucher.VoucherId;
            
            // Tính số tiền giảm dựa trên % và làm tròn để tránh lỗi số thực (ví dụ 19.998đ)
            discount = Math.round((eligibleSubtotal * (voucher.DiscountPercent || 0)) / 100);

            // Áp dụng giảm giá tối đa (nếu có)
            if (voucher.MaxDiscountValue && discount > Number(voucher.MaxDiscountValue)) {
              discount = Number(voucher.MaxDiscountValue);
            }
          }

          const storeTotal = subTotal - discount + SHIPPING_FEE;
          grandTotal += storeTotal;

          // Tạo order
          const newOrder = await tx.orders.create({
            data: {
              UserId: userId,
              StoreId: storeId,
              TotalAmount: storeTotal,
              OrderStatus: 'Pending',
              PaymentStatus: 'Unpaid',
              ShippingAddress: shippingAddressString,
              AddressId: address.AddressId,
            },
          });

          // Tạo order items
          await tx.orderItems.createMany({
            data: items.map(item => ({
              OrderId: newOrder.OrderId,
              VariantId: item.variantId,
              Quantity: item.quantity,
              UnitPrice: item.price,
            })),
          });

          // Tạo order voucher
          if (appliedVoucherId) {
            await tx.orderVouchers.create({
              data: { OrderId: newOrder.OrderId, VoucherId: appliedVoucherId },
            });
          }

          // Tạo payment record
          const paymentRecord = await tx.payments.create({
            data: {
              OrderId: newOrder.OrderId,
              PaymentMethod: dto.paymentMethod,
              Amount: storeTotal,
              Status: 'Pending',
            },
          });

          createdOrders.push({ order: newOrder, payment: paymentRecord });
          this.logger.log(`[CreateOrder] Tạo order #${newOrder.OrderId} cho StoreId ${storeId}, total=${storeTotal}`);
        }

        // Xóa cart items đã chọn
        if (dto.type === 'CART' && dto.selectedItems) {
          const cart = await tx.carts.findUnique({ where: { UserId: userId } });
          if (cart) {
            await tx.cartItems.deleteMany({
              where: { CartId: cart.CartId, CartItemId: { in: dto.selectedItems } },
            });
          }
        }

        return { message: 'Đặt hàng thành công', orders: createdOrders, grandTotal };
      });

      // ── THANH TOÁN MOMO (gộp 1 link duy nhất) ──
      let payUrl: string | undefined;

      if (dto.paymentMethod === 'MOMO') {
        const orderIds = resultData.orders.map(o => o.order.OrderId);
        this.logger.log(`[CreateOrder] Kích hoạt thanh toán MoMo gộp cho OrderIds: [${orderIds.join(', ')}], tổng: ${resultData.grandTotal}`);

        const strategy = this.paymentFactory.get('MOMO');
        if (strategy) {
          // Dùng orderId đầu tiên làm đại diện, encode tất cả IDs trong extraData
          const paymentResult = await strategy.createPayment({
            orderId: orderIds[0],
            amount: resultData.grandTotal,
            orderIds, // truyền thêm danh sách orderIds
          });
          payUrl = paymentResult.payUrl;
          this.logger.log(`[CreateOrder] Sinh thành công Link MoMo gộp cho ${orderIds.length} đơn hàng`);
        }
      }

      return { ...resultData, payUrl };

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
      // Tìm đơn hàng: cho phép cả Khách hàng (người mua) HOẶC Chủ shop xem
      const order = await this.prisma.orders.findFirst({
        where: {
          OrderId: Number(orderId),
          OR: [
            { UserId: userId }, // Khách hàng mua đơn này
            { Stores: { OwnerId: userId } } // Hoặc chủ của Shop sở hữu đơn này (OwnerId)
          ]
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
          where: { 
            OrderId: Number(orderId),
            OR: [
              { UserId: userId },
              { Stores: { OwnerId: userId } }
            ]
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
          InvoiceId: Number(invoiceId),
          Orders: {
            OR: [
              { UserId: userId },
              { Stores: { OwnerId: userId } }
            ]
          }, 
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
              Products: {
                include: {
                  Stores: true,
                },
              },
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
          throw new BadRequestException(
            `Sản phẩm ${i.ProductVariants.Products.ProductName} đã hết hàng hoặc không đủ số lượng`,
          );
        }

        const itemTotal = Number(price) * i.Quantity;
        total += itemTotal;

        return {
          variantId: i.ProductVariants.VariantId,
          productId: i.ProductVariants.ProductId,
          productImage: i.ProductVariants.Products.ThumbnailUrl,
          productName: i.ProductVariants.Products.ProductName,
          price,
          quantity: i.Quantity,
          total: itemTotal,
          stock: i.ProductVariants.Stock,
          storeId: i.ProductVariants.Products.Stores.StoreId,
          storeName: i.ProductVariants.Products.Stores.StoreName,
          storeLogo: i.ProductVariants.Products.Stores.LogoUrl,
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
        include: { 
          Products: {
            include: {
              Stores: true,
            },
          },
        },
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
          productId: variant.ProductId,
          productName: variant.Products.ProductName,
          productImage: variant.Products.ThumbnailUrl,
          price,
          quantity: dto.quantity,
          total,
          stock: variant.Stock,
          storeId: variant.Products.Stores.StoreId,
          storeName: variant.Products.Stores.StoreName,
          storeLogo: variant.Products.Stores.LogoUrl,
        },
      ];
    }

    // GROUP BY STORE AND CALCULATE DISCOUNTS
    const storeGroupsMap = new Map<number, any>();
    items.forEach(item => {
      if (!storeGroupsMap.has(item.storeId)) {
        storeGroupsMap.set(item.storeId, {
          storeId: item.storeId,
          storeName: item.storeName,
          storeLogo: item.storeLogo,
          items: [],
          subTotal: 0,
          discount: 0,
          shippingFee: 30000,
        });
      }
      const group = storeGroupsMap.get(item.storeId);
      group.items.push(item);
      group.subTotal += item.total;
    });

    let totalDiscount = 0;
    const SHIPPING_FEE_PER_SHOP = 30000;

    for (const [storeId, group] of storeGroupsMap) {
      // Find voucher for this store
      const voucherCode = dto.storeVouchers?.find(v => v.storeId === storeId)?.code 
        || (storeGroupsMap.size === 1 ? dto.voucherCode : undefined);

      if (voucherCode) {
        const voucher = await this.prisma.vouchers.findUnique({
          where: { Code: voucherCode },
          include: { VoucherProducts: true },
        });

        if (!voucher) {
          throw new BadRequestException(`Voucher "${voucherCode}" không tồn tại`);
        }

        if (!voucher.IsActive || (voucher.ExpiredDate && voucher.ExpiredDate < new Date())) {
          throw new BadRequestException(`Voucher "${voucherCode}" đã hết hạn hoặc bị vô hiệu hóa`);
        }

        if (voucher.Quantity <= 0) {
          throw new BadRequestException(`Voucher "${voucherCode}" đã hết lượt sử dụng`);
        }

        // Kiểm tra quyền sở hữu của Voucher (Shopee-style)
        if (voucher.StoreId && voucher.StoreId !== storeId) {
          throw new BadRequestException(`Voucher "${voucherCode}" không áp dụng cho shop này`);
        }

        // Tính toán sản phẩm hợp lệ và gắn tag đồng thời
        let eligibleSubtotal = 0;
        const eligibleProductIds = voucher.ApplyType === 'SPECIFIC'
          ? voucher.VoucherProducts.map((vp) => vp.ProductId)
          : null;

        // Reset lại trạng thái voucher trên item trước khi tính
        group.items.forEach(item => {
          item.isVoucherApplied = false;
          item.voucherDiscountLabel = '';
        });

        group.items.forEach((item) => {
          const isEligible = !eligibleProductIds || eligibleProductIds.includes(item.productId);
          if (isEligible) {
            eligibleSubtotal += item.total;
          }
        });

        if (voucher.ApplyType === 'SPECIFIC' && eligibleSubtotal === 0) {
          group.voucherError = `Voucher không áp dụng cho các sản phẩm đã chọn`;
        }

        // Kiểm tra giá trị tối thiểu
        if (!group.voucherError && voucher.MinOrderValue && Number(eligibleSubtotal) < Number(voucher.MinOrderValue)) {
          group.voucherError = `Chưa đạt giá trị tối thiểu ${Number(voucher.MinOrderValue).toLocaleString()}đ`;
        }

        if (!group.voucherError) {
          const discountPercent = voucher.DiscountPercent || 0;
          let shopDiscount = Math.round((eligibleSubtotal * discountPercent) / 100);

          // Áp dụng giảm giá tối đa
          if (voucher.MaxDiscountValue && shopDiscount > Number(voucher.MaxDiscountValue)) {
            shopDiscount = Number(voucher.MaxDiscountValue);
          }

          group.discount = shopDiscount;
          totalDiscount += shopDiscount;

          // Gắn tag cho các sản phẩm thực sự đóng góp vào eligibleSubtotal
          group.items.forEach((item) => {
            const isEligible = !eligibleProductIds || eligibleProductIds.includes(item.productId);
            if (isEligible) {
              item.isVoucherApplied = true;
              item.voucherDiscountLabel = `-${voucher.DiscountPercent}%`;
            }
          });
        }
      }
      group.shopTotal = group.subTotal - group.discount + group.shippingFee;
    }

    const totalShippingFee = storeGroupsMap.size * SHIPPING_FEE_PER_SHOP;
    const finalTotal = total - totalDiscount + totalShippingFee;

    return {
      storeGroups: Array.from(storeGroupsMap.values()),
      total,
      shippingFee: totalShippingFee,
      discount: totalDiscount,
      finalTotal,
    };

  } catch (error) {
    throw new Error(error.message || 'Preview failed');
  }
  }

  async getAllOrder(userId: number) {
    try {
      const orders = await this.prisma.orders.findMany({
        where: { UserId: userId },
        orderBy: { CreatedAt: 'desc' },
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
          OrderVouchers: {
            include: {
              Vouchers: true,
            },
          },
          Stores: {
            select: {
              StoreName: true,
              LogoUrl: true,
            },
          },
        },
      });

      const result = orders.map(order => {
        const voucher = order.OrderVouchers[0]?.Vouchers;
        const payment = order.Payments[0];

        const items = order.OrderItems.map(i => ({
          variantId: i.ProductVariants.VariantId,
          productName: i.ProductVariants.Products.ProductName,
          productImage: i.ProductVariants.Products.ThumbnailUrl,
          variant: `${i.ProductVariants.Size} - ${i.ProductVariants.Color}`,
          quantity: i.Quantity,
          unitPrice: i.UnitPrice,
          total: Number(i.UnitPrice) * i.Quantity,
        }));

        return {
          orderId: order.OrderId,
          orderStatus: order.OrderStatus,
          paymentStatus: order.PaymentStatus,
          totalAmount: order.TotalAmount,
          shippingAddress: order.ShippingAddress,
          createdAt: order.CreatedAt,
          store: order.Stores
            ? {
                storeName: order.Stores.StoreName,
                logo: order.Stores.LogoUrl,
              }
            : null,
          items,
          voucher: voucher
            ? {
                code: voucher.Code,
                discountPercent: voucher.DiscountPercent,
              }
            : null,
          payment: payment
            ? {
                method: payment.PaymentMethod,
                status: payment.Status,
              }
            : null,
        };
      });

      return {
        message: 'Get all orders successfully',
        data: {
          total: result.length,
          orders: result,
        },
      };
    } catch (error) {
      this.logger.error(`[GetAllOrder Error] ${error.message}`);
      throw new NotFoundException(error.message || 'Get all orders failed');
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
  async verifyMomoPayment(orderId: string, resultCode: string) {
    this.logger.log(`[VerifyMomo] Kiểm tra trạng thái cho đơn hàng: ${orderId}, ResultCode: ${resultCode}`);
    
    // Tách lấy ID gốc nếu là chuỗi CPS_...
    const cleanId = orderId.includes('_') ? Number(orderId.split('_')[1]) : Number(orderId);
    
    if (isNaN(cleanId)) {
      throw new BadRequestException('Mã đơn hàng không hợp lệ');
    }

    const order = await this.prisma.orders.findUnique({
      where: { OrderId: cleanId },
      include: { Payments: true }
    });

    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }

    // Nếu MoMo báo thành công (resultCode = 0) 
    // Chúng ta có thể trả về trạng thái Success để FE hiển thị, 
    // mặc dù DB có thể đang chờ IPN cập nhật.
    return {
      orderId: cleanId,
      status: order.PaymentStatus, // 'Paid', 'Unpaid', ...
      momoResult: resultCode === '0' ? 'Success' : 'Failed',
      message: resultCode === '0' ? 'Thanh toán thành công' : 'Thanh toán thất bại hoặc bị hủy'
    };
  }
}
