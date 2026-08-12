import { Controller, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { StreamsService } from './streams.service';

@Controller('streams')
@UseGuards(AuthGuard)
export class StreamsController {
  constructor(private readonly streams: StreamsService) {}
  @Post(':cameraId/session')
  create(@Param('cameraId') cameraId: string, @Query('quality') quality: 'main' | 'sub' = 'sub') {
    return this.streams.createSession(cameraId, quality === 'main' ? 'main' : 'sub');
  }
}
