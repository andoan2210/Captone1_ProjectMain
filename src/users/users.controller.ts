import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }
  
 @Get()
 findAll(
   @Query('page') page = '1',
   @Query('limit') limit = '10',
   ){
    const pageNum = Number(page);
    const limitNum = Number(limit);

    return this.usersService.findAll(
        pageNum > 0 ? pageNum : 1,
        limitNum > 0 ? limitNum : 10,
    );
 }

  @Get('email')
  findByEmail(@Query('email') email: string) {
    return this.usersService.findByEmail(email);
  }


  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateUserDto) {
    return this.usersService.update(+id, updateDto);
  }


  @Delete()
  remove(@Body() body: { email: string }) {
    return this.usersService.remove(body.email);
  }
  
  @Post('verify-email')
  verifyEmail(@Body() body: { email: string; code: string }) {
    return this.usersService.verifyEmailCode(body.email, body.code);
  }
}
