import { Module } from "@nestjs/common";
import { HikvisionClient } from "./hikvision.client";
import { RtspProbeService } from "./rtsp-probe.service";

@Module({
	providers: [HikvisionClient, RtspProbeService],
	exports: [HikvisionClient, RtspProbeService],
})
export class HikvisionModule {}
