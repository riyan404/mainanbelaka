import { Body, Controller, Get, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';
import { ChangePasswordDto, LoginDto } from './auth.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(dto.username, dto.password);
    response.cookie('cctv_session', result.token, {
      httpOnly: true,
      sameSite: 'strict',
      // LAN MVP berjalan melalui HTTP; aktifkan COOKIE_SECURE setelah reverse proxy HTTPS dipasang.
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: 8 * 60 * 60 * 1000,
      path: '/'
    });
    return { admin: result.admin };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response): { ok: true } {
    response.clearCookie('cctv_session', { path: '/' });
    return { ok: true };
  }

  @Get('session')
  @UseGuards(AuthGuard)
  session(@Req() request: AuthenticatedRequest) {
    return { admin: request.admin };
  }

  @Put('password')
  @UseGuards(AuthGuard)
  async changePassword(@Req() request: AuthenticatedRequest, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(request.admin.id, dto.currentPassword, dto.newPassword);
    return { ok: true };
  }
}
