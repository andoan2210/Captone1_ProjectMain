import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Logger } from 'nestjs-pino';
import { PrismaService } from 'src/prisma/prisma.service';
import { Logger } from 'nestjs-pino';

@Injectable()
export class AddressService {
  constructor(private readonly prisma: PrismaService,
              private readonly logger: Logger) {}

async createAddress(userId: number, dto: CreateAddressDto) {
  try {
    const {fullName,phone,province,district,ward,detailAddress,isDefault,} = dto;

    const count = await this.prisma.userAddresses.count({
      where: { UserId: userId },
    });

    const finalIsDefault = count === 0 ? true : isDefault;

    const address = await this.prisma.$transaction(async (tx) => {
      if (finalIsDefault) {
        await tx.userAddresses.updateMany({
          where: { UserId: userId },
          data: { IsDefault: false },
        });
      }

      return tx.userAddresses.create({
        data: {
          UserId: userId,
          FullName: fullName.trim(),
          Phone: phone.trim(),
          Province: province,
          District: district,
          Ward: ward,
          DetailAddress: detailAddress,
          IsDefault: finalIsDefault,
        },
      });
    });
    this.logger.log('Creating address', { data: address });
    return {
      message: 'Address created successfully',
      data: {
        id: address.AddressId,
        fullName: address.FullName,
        phone: address.Phone,
        isDefault: address.IsDefault,
      },
    };
  } catch (error) {
    this.logger.error('Failed to create address', { error });
    throw new BadRequestException(error.message);
  }
}
async findAll(userId: number) {
  try {
    const addresses = await this.prisma.userAddresses.findMany({
      where: {
        UserId: userId,
      },
      orderBy: [
        { IsDefault: 'desc' }, // default lên đầu
        { CreatedAt: 'desc' },
      ],
    });

    return {
      message: 'Get addresses successfully',
      data: addresses.map((addr) => ({
        id: addr.AddressId,
        fullName: addr.FullName,
        phone: addr.Phone,
        province: addr.Province,
        district: addr.District,
        ward: addr.Ward,
        detailAddress: addr.DetailAddress,
        isDefault: addr.IsDefault,
      })),
    };
  } catch (error) {
    this.logger.error('Failed to get addresses', { error });
    throw new BadRequestException(error.message);
  }
}

async findOne(userId: number, id: number) {
  try {
    const address = await this.prisma.userAddresses.findFirst({
      where: {
        AddressId: id,
        UserId: userId,
      },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    return {
      message: 'Get address successfully',
      data: {
        id: address.AddressId,
        fullName: address.FullName,
        phone: address.Phone,
        province: address.Province,
        district: address.District,
        ward: address.Ward,
        detailAddress: address.DetailAddress,
        isDefault: address.IsDefault,
      },
    };
  } catch (error) {
    this.logger.error('Failed to get address', { error });
    throw new BadRequestException(error.message);
  }
}

async updateAddress(userId: number, id: number, dto: UpdateAddressDto) {
  try {
    // check ton tai address
    const existing = await this.prisma.userAddresses.findFirst({
      where: {
        AddressId: id,
        UserId: userId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Address not found');
    }
    // transaction vi 2 query
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.userAddresses.updateMany({
          where: { UserId: userId },
          data: { IsDefault: false },
        });
      }

      if (existing.IsDefault && dto.isDefault === false) {
        throw new BadRequestException(
          'Must have at least one default address',
        );
      }

      return tx.userAddresses.update({
        where: { AddressId: id },
        data: {
          FullName: dto.fullName?.trim(),
          Phone: dto.phone?.trim(),
          Province: dto.province,
          District: dto.district,
          Ward: dto.ward,
          DetailAddress: dto.detailAddress,
          IsDefault: dto.isDefault,
        },
      });
    });
    this.logger.log('Updating address', { data: updated });
    return {
      message: 'Address updated successfully',
      data: {
        id: updated.AddressId,
        fullName: updated.FullName,
        phone: updated.Phone,
        isDefault: updated.IsDefault,
      },
    };
  } catch (error) {
    this.logger.error('Failed to update address', { error });
    throw new BadRequestException(error.message);
  }
}

async remove(userId: number, addressId: number) {
  try {
    return await this.prisma.$transaction(async (tx) => {
      const existing = await tx.userAddresses.findFirst({
        where: {
          AddressId: addressId,
          UserId: userId,
        },
      });

      if (!existing) {
        throw new NotFoundException('Address not found');
      }

      if (existing.IsDefault) {
        const another = await tx.userAddresses.findFirst({
          where: {
            UserId: userId,
            AddressId: { not: addressId },
          },
        });

        if (!another) {
          throw new BadRequestException(
            'Must have at least one default address',
          );
        }

        await tx.userAddresses.update({
          where: { AddressId: another.AddressId },
          data: { IsDefault: true },
        });
      }

      await tx.userAddresses.delete({
        where: { AddressId: addressId },
      });

      this.logger.log('Deleting address', { addressId });

      return {
        message: 'Address deleted successfully',
      };
    });
  } catch (error) {
    this.logger.error('Failed to delete address', { error });
    throw new BadRequestException(error.message);
  }
}

  constructor(private readonly prisma: PrismaService,
              private readonly logger: Logger) {}

async createAddress(userId: number, dto: CreateAddressDto) {
  try {
    const {fullName,phone,province,district,ward,detailAddress,isDefault,} = dto;

    const count = await this.prisma.userAddresses.count({
      where: { UserId: userId },
    });

    const finalIsDefault = count === 0 ? true : isDefault;

    const address = await this.prisma.$transaction(async (tx) => {
      if (finalIsDefault) {
        await tx.userAddresses.updateMany({
          where: { UserId: userId },
          data: { IsDefault: false },
        });
      }

      return tx.userAddresses.create({
        data: {
          UserId: userId,
          FullName: fullName.trim(),
          Phone: phone.trim(),
          Province: province,
          District: district,
          Ward: ward,
          DetailAddress: detailAddress,
          IsDefault: finalIsDefault,
        },
      });
    });
    this.logger.log('Creating address', { data: address });
    return {
      message: 'Address created successfully',
      data: {
        id: address.AddressId,
        fullName: address.FullName,
        phone: address.Phone,
        isDefault: address.IsDefault,
      },
    };
  } catch (error) {
    this.logger.error('Failed to create address', { error });
    throw new BadRequestException(error.message);
  }
}
async findAll(userId: number) {
  try {
    const addresses = await this.prisma.userAddresses.findMany({
      where: {
        UserId: userId,
      },
      orderBy: [
        { IsDefault: 'desc' }, // default lên đầu
        { CreatedAt: 'desc' },
      ],
    });

    return {
      message: 'Get addresses successfully',
      data: addresses.map((addr) => ({
        id: addr.AddressId,
        fullName: addr.FullName,
        phone: addr.Phone,
        province: addr.Province,
        district: addr.District,
        ward: addr.Ward,
        detailAddress: addr.DetailAddress,
        isDefault: addr.IsDefault,
      })),
    };
  } catch (error) {
    this.logger.error('Failed to get addresses', { error });
    throw new BadRequestException(error.message);
  }
}

async findOne(userId: number, id: number) {
  try {
    const address = await this.prisma.userAddresses.findFirst({
      where: {
        AddressId: id,
        UserId: userId,
      },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    return {
      message: 'Get address successfully',
      data: {
        id: address.AddressId,
        fullName: address.FullName,
        phone: address.Phone,
        province: address.Province,
        district: address.District,
        ward: address.Ward,
        detailAddress: address.DetailAddress,
        isDefault: address.IsDefault,
      },
    };
  } catch (error) {
    this.logger.error('Failed to get address', { error });
    throw new BadRequestException(error.message);
  }
}

async updateAddress(userId: number, id: number, dto: UpdateAddressDto) {
  try {
    // check ton tai address
    const existing = await this.prisma.userAddresses.findFirst({
      where: {
        AddressId: id,
        UserId: userId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Address not found');
    }
    // transaction vi 2 query
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.userAddresses.updateMany({
          where: { UserId: userId },
          data: { IsDefault: false },
        });
      }

      if (existing.IsDefault && dto.isDefault === false) {
        // cho phep xet default la false neu nhu co address khac
          const another = await tx.userAddresses.findFirst({
          where: {
            UserId: userId,
            AddressId: { not: id },
          },
          })
          if (!another) {
            throw new BadRequestException(
              'Must have at least one default address',
            );
          }

          await tx.userAddresses.update({
            where: { AddressId: another.AddressId },
            data: { IsDefault: true },
          });
      }

      return tx.userAddresses.update({
        where: { AddressId: id },
        data: {
          FullName: dto.fullName?.trim(),
          Phone: dto.phone?.trim(),
          Province: dto.province,
          District: dto.district,
          Ward: dto.ward,
          DetailAddress: dto.detailAddress,
          IsDefault: dto.isDefault,
        },
      });
    });
    this.logger.log('Updating address', { data: updated });
    return {
      message: 'Address updated successfully',
      data: {
        id: updated.AddressId,
        fullName: updated.FullName,
        phone: updated.Phone,
        isDefault: updated.IsDefault,
      },
    };
  } catch (error) {
    this.logger.error('Failed to update address', { error });
    throw new BadRequestException(error.message);
  }
}

async remove(userId: number, addressId: number) {
  try {
    return await this.prisma.$transaction(async (tx) => {
      const existing = await tx.userAddresses.findFirst({
        where: {
          AddressId: addressId,
          UserId: userId,
        },
      });

      if (!existing) {
        throw new NotFoundException('Address not found');
      }

      if (existing.IsDefault) {
        const another = await tx.userAddresses.findFirst({
          where: {
            UserId: userId,
            AddressId: { not: addressId },
          },
        });

        if (!another) {
          throw new BadRequestException(
            'Must have at least one default address',
          );
        }

        await tx.userAddresses.update({
          where: { AddressId: another.AddressId },
          data: { IsDefault: true },
        });
      }

      await tx.userAddresses.delete({
        where: { AddressId: addressId },
      });

      this.logger.log('Deleting address', { addressId });

      return {
        message: 'Address deleted successfully',
      };
    });
  } catch (error) {
    this.logger.error('Failed to delete address', { error });
    throw new BadRequestException(error.message);
  }
}

}
