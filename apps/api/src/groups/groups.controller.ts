import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CreateGroupDto, SetGroupCamerasDto } from './groups.dto';
import { GroupsService } from './groups.service';

@Controller('groups')
@UseGuards(AuthGuard)
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}
  @Get() list() { return this.groups.list(); }
  @Post() create(@Body() dto: CreateGroupDto) { return this.groups.create(dto); }
  @Put(':id') update(@Param('id') id: string, @Body() dto: CreateGroupDto) { return this.groups.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.groups.remove(id); }
  @Put(':id/cameras') setCameras(@Param('id') id: string, @Body() dto: SetGroupCamerasDto) { return this.groups.setCameras(id, dto.cameraIds); }
  @Post(':id/default') setDefault(@Param('id') id: string) { return this.groups.setDefault(id); }
}
