import {
	Body,
	Controller,
	Delete,
	Get,
	NotFoundException,
	Param,
	Post,
	Put,
	Query,
	Res,
	UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { AuthGuard } from "../auth/auth.guard";
import {
	CreateZoneDto,
	EnableAnalyticsDto,
	EventQueryDto,
	SummaryQueryDto,
	UpdateZoneDto,
} from "./analytics.dto";
import { AnalyticsService } from "./analytics.service";

@Controller("analytics")
@UseGuards(AuthGuard)
export class AnalyticsController {
	constructor(private readonly analytics: AnalyticsService) {}

	// ─── Zones ────────────────────────────────────────────────────

	@Get("zones")
	listZones(@Query("cameraId") cameraId?: string) {
		return this.analytics.listZones(cameraId);
	}

	@Post("zones")
	createZone(@Body() dto: CreateZoneDto) {
		return this.analytics.createZone(dto);
	}

	@Put("zones/:id")
	updateZone(@Param("id") id: string, @Body() dto: UpdateZoneDto) {
		return this.analytics.updateZone(id, dto);
	}

	@Delete("zones/:id")
	removeZone(@Param("id") id: string) {
		return this.analytics.removeZone(id);
	}

	// ─── Module enable/disable ────────────────────────────────────

	@Post("cameras/:cameraId/enable")
	enable(
		@Param("cameraId") cameraId: string,
		@Body() dto: EnableAnalyticsDto,
	) {
		return this.analytics.enableAnalytics(cameraId, dto.mode ?? "POSE");
	}

	@Post("cameras/:cameraId/disable")
	disable(@Param("cameraId") cameraId: string) {
		return this.analytics.disableAnalytics(cameraId);
	}

	@Get("cameras/:cameraId/status")
	getStatus(@Param("cameraId") cameraId: string) {
		return this.analytics.getStatus(cameraId);
	}

	@Get("cameras/statuses")
	listStatuses() {
		return this.analytics.listCameraStatuses();
	}

	// ─── Snapshot ─────────────────────────────────────────────────

	@Get("cameras/:cameraId/snapshot")
	getSnapshot(@Param("cameraId") cameraId: string, @Res() res: Response) {
		const stream = this.analytics.getSnapshotStream(cameraId);
		if (!stream) throw new NotFoundException("Snapshot belum tersedia");
		res.setHeader("Content-Type", "image/jpeg");
		res.setHeader("Cache-Control", "no-cache");
		stream.pipe(res);
	}

	// ─── Events ───────────────────────────────────────────────────

	@Get("events")
	listEvents(@Query() query: EventQueryDto) {
		return this.analytics.listEvents(query);
	}

	@Get("summary")
	getSummary(@Query() query: SummaryQueryDto) {
		return this.analytics.getSummary(query);
	}

	// ─── Live state (overlay realtime di dashboard) ──────────────

	@Get("cameras/:cameraId/live")
	getLiveState(@Param("cameraId") cameraId: string) {
		return this.analytics.getLiveState(cameraId);
	}
}
