import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Body,
    Query,
    UseGuards,
    ParseIntPipe,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from 'src/auth/passport/jwt-auth.guard';

@Controller('admin/accounts')
//@UseGuards(JwtAuthGuard)
export class AdminUsersController {
    constructor(private readonly usersService: UsersService) { }

    // ✅ GET ALL
    @Get()
    findAll(
        @Query('page') page = '1',
        @Query('limit') limit = '10',
    ) {
        return this.usersService.findAll(Number(page), Number(limit));
    }

    // ✅ CREATE USER
    @Post()
    create(@Body() dto: any) {
        return this.usersService.createByAdmin(dto);
    }

    // ✅ UPDATE USER
    @Patch(':id')
    update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: any,
    ) {
        return this.usersService.updateByAdmin(id, dto);
    }

    // 🔒 TOGGLE STATUS
    @Patch(':id/toggle-status')
    toggleStatus(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: any,
    ) {
        return this.usersService.toggleStatus(id, body.isActive);
    }

    // ❌ DELETE (xóa thật hoặc fallback khóa)
    @Delete(':id')
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.usersService.deleteByAdmin(id);
    }
}