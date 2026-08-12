import { Controller, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import type { DashboardLayout } from '../common/domain';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}
  @Get()
  get(
    @Query('groupId') groupId?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('layout', new ParseIntPipe({ optional: true })) layout?: DashboardLayout
  ) { return this.dashboard.get(groupId, page, layout); }
}
