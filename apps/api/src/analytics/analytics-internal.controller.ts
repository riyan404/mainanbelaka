import {
	Body,
	Controller,
	Get,
	HttpCode,
	Post,
	Req,
	UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import {
	BatchEventsDto,
	LiveStateDto,
	WorkerStatusUpdateDto,
} from "./analytics.dto";
import { AnalyticsInternalGuard } from "./analytics-internal.guard";
import { AnalyticsService } from "./analytics.service";

/**
 * Endpoint internal yang hanya diakses oleh Analytics Worker.
 * Diautentikasi via X-Internal-Token header, bukan sesi admin.
 * Tidak pernah diekspos ke frontend.
 */
@Controller("internal/analytics")
@UseGuards(AnalyticsInternalGuard)
export class AnalyticsInternalController {
	constructor(private readonly analytics: AnalyticsService) {}

	@Get("active-cameras")
	getActiveCameras() {
		return this.analytics.getActiveCameras();
	}

	@Post("events")
	@HttpCode(201)
	ingestEvents(@Body() dto: BatchEventsDto) {
		return this.analytics.ingestEvents(dto);
	}

	@Post("worker-status")
	@HttpCode(200)
	updateWorkerStatus(@Body() dto: WorkerStatusUpdateDto) {
		return this.analytics.updateWorkerStatus(
			dto.cameraChannelId,
			dto.workerStatus as "IDLE" | "RUNNING" | "ERROR",
			dto.lastErrorMessage,
		);
	}

	@Post("live-state")
	@HttpCode(200)
	pushLiveState(@Body() dto: LiveStateDto) {
		return this.analytics.storeLiveState(dto);
	}

	@Post("snapshot")
	@HttpCode(201)
	async uploadSnapshot(@Req() request: Request) {
		const cameraId = request.headers["x-camera-id"] as string;
		if (!cameraId) return { error: "Header X-Camera-Id wajib" };

		const chunks: Buffer[] = [];
		for await (const chunk of request) {
			chunks.push(Buffer.from(chunk));
		}
		const buffer = Buffer.concat(chunks);
		if (buffer.length === 0) return { error: "Body kosong" };

		return this.analytics.saveSnapshot(cameraId, buffer);
	}
}
