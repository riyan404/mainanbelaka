import { Body, Controller, Get, Param, ParseBoolPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { SetCameraEnabledDto, UpdateCameraDto } from './cameras.dto';
import { CamerasService } from './cameras.service';

@Controller('cameras')
@UseGuards(AuthGuard)
export class CamerasController {
  constructor(private readonly cameras: CamerasService) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('enabled', new ParseBoolPipe({ optional: true })) enabled?: boolean,
    @Query('page') pageStr?: string,
    @Query('pageSize') pageSizeStr?: string,
  ) {
    const page = pageStr ? Math.max(1, parseInt(pageStr, 10) || 1) : 1;
    const pageSize = pageSizeStr
      ? Math.min(100, Math.max(1, parseInt(pageSizeStr, 10) || 25))
      : 25;
    return this.cameras.list(search, enabled, page, pageSize);
  }

  @Put(':id') update(@Param('id') id: string, @Body() dto: UpdateCameraDto) { return this.cameras.update(id, dto); }
  @Post(':id/test') test(@Param('id') id: string) { return this.cameras.test(id); }
  @Post(':id/enabled') setEnabled(@Param('id') id: string, @Body() dto: SetCameraEnabledDto) { return this.cameras.setEnabled(id, dto.enabled); }
}
