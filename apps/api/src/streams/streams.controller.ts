import { Controller, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { StreamsService } from './streams.service';

@Controller('streams')
@UseGuards(AuthGuard)
export class StreamsController {
  constructor(private readonly streams: StreamsService) {}
  @Post(':cameraId/session')
  create(
    @Req() request: Request,
    @Param('cameraId') cameraId: string,
    @Query('quality') quality: 'main' | 'sub' = 'sub',
  ) {
    const forwardedHost =
      request.get('x-forwarded-host') ?? request.get('host');
    return this.streams.createSession(
      cameraId,
      quality === 'main' ? 'main' : 'sub',
      forwardedHost,
    );
  }
}
