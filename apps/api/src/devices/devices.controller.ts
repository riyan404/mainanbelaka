import { Body, Controller, Delete, Get, Param, ParseBoolPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CreateDeviceDto, DeviceConnectionDto, UpdateDeviceDto } from './devices.dto';
import { DevicesService } from './devices.service';

@Controller('devices')
@UseGuards(AuthGuard)
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get() list(@Query('archived', new ParseBoolPipe({ optional: true })) archived?: boolean) { return this.devices.list(archived); }
  @Post('test-detect') testDetect(@Body() dto: DeviceConnectionDto) { return this.devices.testDetect(dto); }
  @Post() create(@Body() dto: CreateDeviceDto) { return this.devices.create(dto); }
  @Put(':id') update(@Param('id') id: string, @Body() dto: UpdateDeviceDto) { return this.devices.update(id, dto); }
  @Post(':id/archive') archive(@Param('id') id: string) { return this.devices.archive(id); }
  @Post(':id/restore') restore(@Param('id') id: string) { return this.devices.restore(id); }
  @Post(':id/redetect') redetect(@Param('id') id: string) { return this.devices.redetect(id); }
  @Delete(':id') remove(@Param('id') id: string) { return this.devices.remove(id); }
}
