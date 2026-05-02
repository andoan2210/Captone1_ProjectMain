import { Controller, Get, Post, Body, Patch, Param, Query, Req } from '@nestjs/common';
import { ReportService } from './report.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportStatusDto } from './dto/update-report.dto';
import { FilterReportDto } from './dto/filter-report.dto';

// TODO: Import Guard của dự án bạn vào đây
// import { UseGuards } from '@nestjs/common';
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
// import { RolesGuard } from '../auth/guards/roles.guard';
// import { Roles } from '../auth/decorators/roles.decorator';

@Controller('report')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  // Ghi chú: User gửi báo cáo
  // @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req, @Body() createReportDto: CreateReportDto) {
    // Lấy ID người dùng từ token (thường là req.user.userId)
    // const userId = req.user.userId;
    const userId = 1; // MOCK USER ID - Bạn nhớ sửa dòng này sau khi có Auth
    
    return this.reportService.createReport(userId, createReportDto);
  }

  // Ghi chú: Admin xem danh sách báo cáo
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles('ADMIN')
  @Get('admin')
  findAllForAdmin(@Query() filterDto: FilterReportDto) {
    return this.reportService.findAllForAdmin(filterDto);
  }

  // Ghi chú: Admin xem chi tiết báo cáo
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles('ADMIN')
  @Get('admin/:id')
  findOne(@Param('id') id: string) {
    return this.reportService.findOne(+id);
  }

  // Ghi chú: Admin cập nhật trạng thái báo cáo
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles('ADMIN')
  @Patch('admin/:id/status')
  updateStatus(
    @Req() req,
    @Param('id') id: string, 
    @Body() updateReportStatusDto: UpdateReportStatusDto
  ) {
    // Lấy ID của Admin từ token
    // const adminId = req.user.userId;
    const adminId = 1; // MOCK ADMIN ID - Bạn nhớ sửa dòng này sau khi có Auth

    return this.reportService.updateStatus(+id, adminId, updateReportStatusDto);
  }
}
