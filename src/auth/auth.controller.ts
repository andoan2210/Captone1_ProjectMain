import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Res, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import {Response} from 'express';
import { LocalAuthGuard } from './passport/local-auth.guard';
import { JwtAuthGuard } from './passport/jwt-auth.guard';
import { RolesGuard } from './passport/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { Role } from './enums/role.enum';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UseGuards(LocalAuthGuard)
  async handleLogin(@Request() req, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.login(req.user);

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: false, // production = true
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
    accessToken: tokens.accessToken,
  };
}
  @Post('refresh')
  async refreshToken(@Req() req, @Res({ passthrough: true }) res: Response) {

  const refreshToken = req.cookies.refreshToken;

  const result = await this.authService.refreshToken(refreshToken);

  return result;
}
  
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('refreshToken');

    return {
      message: 'Logged out successfully',
    };
  }

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SHOP_OWNER, Role.CLIENT)
  @Get('profile')
  getProfile(@Request() req) {
    return req.user;
  }


}
