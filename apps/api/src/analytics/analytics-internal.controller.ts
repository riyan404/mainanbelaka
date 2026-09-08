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
import { StaffService } from "../staff/staff.service";

/**
 * Endpoint internal yang hanya diakses oleh Analytics Worker.
 * Diautentikasi via X-Internal-Token header, bukan sesi admin.
 * Tidak pernah diekspos ke frontend.
 */
@Controller("internal/analytics")
@UseGuards(AnalyticsInternalGuard)
export class AnalyticsInternalController {
	constructor(
		private readonly analytics: AnalyticsService,
		private readonly staff: StaffService,
	) {}

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

	// ─── Face Recognition (worker ↔ API) ──────────────────────────────────

	/** Ambil semua embedding yang sudah enrolled (untuk matching di worker). */
	@Get("face-embeddings")
	getAllEmbeddings() {
		return this.staff.getAllEmbeddings();
	}

	/** Ambil foto face yang belum di-extract embeddingnya. */
	@Get("face-pending")
	getPendingEmbeddings() {
		return this.staff.getPendingEmbeddings();
	}

	/** Worker update embedding setelah extract dari foto. */
	@Post("face-embedding")
	@HttpCode(200)
	updateEmbedding(@Body() body: { id: string; embedding: number[] }) {
		return this.staff.updateEmbedding(body.id, body.embedding);
	}

	/** Ambil face recognition threshold dari settings. */
	@Get("face-settings")
	async getFaceSettings() {
		const threshold = await this.staff.getSetting("faceRecognitionThreshold");
		const unknownRetention = await this.staff.getSetting("unknownEventRetentionDays");
		return {
			faceRecognitionThreshold: threshold
				? Number.parseFloat(threshold.value)
				: 0.5,
			unknownEventRetentionDays: unknownRetention
				? Number.parseInt(unknownRetention.value, 10)
				: 2,
		};
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
