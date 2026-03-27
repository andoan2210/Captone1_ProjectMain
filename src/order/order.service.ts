import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { dmmfToRuntimeDataModel } from '@prisma/client/runtime/library';

@Injectable()
export class OrderService {
  constructor(private readonly prisma: PrismaService) {}

  create(createOrderDto: CreateOrderDto) {
    return 'This action adds a new order';
  }

  findAll() {
    return `This action returns all order`;
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
