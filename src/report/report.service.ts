import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportStatusDto } from './dto/update-report.dto';
import { FilterReportDto } from './dto/filter-report.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportService {
  constructor(private prisma: PrismaService) { }

  async createReport(userId: number, createReportDto: CreateReportDto) {
    const { productId, reportType, description, evidenceImages } = createReportDto;

    // Kiểm tra sản phẩm có tồn tại không
    const product = await this.prisma.products.findUnique({
      where: { ProductId: productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Tạo báo cáo và lưu hình ảnh (nếu có), đồng thời ghi log hệ thống
    const report = await this.prisma.productReports.create({
      data: {
        ProductId: productId,
        ReporterId: userId,
        StoreId: product.StoreId,
        ReportType: reportType,
        Description: description,
        Status: 'PENDING',
        ReportEvidences: {
          create: evidenceImages?.map(url => ({ ImageUrl: url })) || [],
        },
        ReportLogs: {
          create: [
            {
              Action: 'Hệ thống: Tạo báo cáo tự động',
            }
          ]
        }
      },
      include: {
        ReportEvidences: true,
      }
    });

    return report;
  }

  async findAllForAdmin(filterDto: FilterReportDto) {
    const { page = 1, limit = 10, status, searchTerm } = filterDto;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (status) {
      where.Status = status;
    }

    if (searchTerm) {
      where.OR = [
        { ReportType: { contains: searchTerm } },
        { Description: { contains: searchTerm } },
        { Reporter: { Email: { contains: searchTerm } } },
        { Reporter: { FullName: { contains: searchTerm } } },
        { Products: { ProductName: { contains: searchTerm } } }
      ];
    }

    const [total, reports] = await Promise.all([
      this.prisma.productReports.count({ where }),
      this.prisma.productReports.findMany({
        where,
        skip,
        take: limit,
        orderBy: { CreatedAt: 'desc' },
        include: {
          Products: {
            select: { ProductId: true, ProductName: true, ThumbnailUrl: true }
          },
          Stores: {
            select: { StoreId: true, StoreName: true }
          },
          Reporter: {
            select: { UserId: true, FullName: true, Email: true }
          },
        }
      })
    ]);

    return {
      data: reports,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async findOne(id: number) {
    const report = await this.prisma.productReports.findUnique({
      where: { ReportId: id },
      include: {
        Products: {
          select: { ProductId: true, ProductName: true, ThumbnailUrl: true }
        },
        Stores: {
          select: { StoreId: true, StoreName: true }
        },
        Reporter: {
          select: { UserId: true, FullName: true, Email: true }
        },
        ReportEvidences: true,
        ReportLogs: {
          orderBy: { CreatedAt: 'desc' },
          include: {
            AdminUser: {
              select: { UserId: true, FullName: true }
            }
          }
        }
      }
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    // Lấy danh sách tất cả báo cáo cho sản phẩm này để hiển thị số lần và lí do chi tiết
    const allReportsForProduct = await this.prisma.productReports.findMany({
      where: { ProductId: report.ProductId },
      include: {
        Reporter: {
          select: { FullName: true, Email: true }
        }
      },
      orderBy: { CreatedAt: 'desc' }
    });

    return {
      ...report,
      productReportStats: {
        totalReports: allReportsForProduct.length,
        history: allReportsForProduct.map(r => ({
          reportId: r.ReportId,
          reportType: r.ReportType,
          description: r.Description,
          createdAt: r.CreatedAt,
          status: r.Status,
          reporterName: r.Reporter.FullName
        }))
      }
    };
  }

  async updateStatus(id: number, adminId: number, updateDto: UpdateReportStatusDto) {
    const { status, note, banProduct } = updateDto;

    const report = await this.prisma.productReports.findUnique({
      where: { ReportId: id }
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    let actionText = note
      ? `Admin System: Đổi trạng thái thành ${status} - Ghi chú: ${note}`
      : `Admin System: Đổi trạng thái thành ${status}`;

    // Cập nhật phản hồi cho sản phẩm nếu báo cáo được giải quyết
    if (status === 'RESOLVED') {
      const feedbackMessage = `[Báo cáo #${id}] Loại: ${report.ReportType}. Nội dung: ${report.Description}. Ghi chú Admin: ${note || 'Không có'}`;
      
      await this.prisma.products.update({
        where: { ProductId: report.ProductId },
        data: {
          RejectReason: feedbackMessage,
          ...(banProduct ? { IsActive: false, ApprovalStatus: 'REJECTED' } : {})
        }
      });
      
      if (banProduct) {
        actionText += ` (Đã thực hiện khóa sản phẩm)`;
      }
    }

    const updatedReport = await this.prisma.productReports.update({
      where: { ReportId: id },
      data: {
        Status: status,
        ReportLogs: {
          create: {
            Action: actionText,
            PerformedById: adminId
          }
        }
      }
    });

    return updatedReport;
  }
}
