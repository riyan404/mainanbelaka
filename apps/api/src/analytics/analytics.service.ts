import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CredentialsService } from "../common/credentials.service";
import { PrismaService } from "../database/prisma.service";
import type {
	BatchEventsDto,
	CreateZoneDto,
	EventQueryDto,
	LiveStateDto,
	SummaryQueryDto,
	UpdateZoneDto,
} from "./analytics.dto";

/** Satu orang terdeteksi (dipush worker untuk overlay realtime). */
export interface LiveTrack {
	trackRef: string;
	bbox: number[];
	posture: "SITTING" | "STANDING" | "UNKNOWN" | null;
	zoneId: string | null;
	durationSeconds: number;
}

/** Snapshot live state per kamera, disimpan in-memory. */
interface CameraLiveState {
	tracks: LiveTrack[];
	updatedAt: Date;
}

/** TTL stale: kalau worker >15 detik tidak push, anggap kosong. */
const LIVE_STATE_TTL_MS = 15_000;

@Injectable()
export class AnalyticsService {
	private readonly logger = new Logger(AnalyticsService.name);
	/** cameraChannelId → live state terbaru dari worker. */
	private readonly liveStates = new Map<string, CameraLiveState>();

	constructor(
		private readonly prisma: PrismaService,
		private readonly credentials: CredentialsService,
	) {}

	// ─── Zones CRUD ───────────────────────────────────────────────

	async listZones(cameraId?: string) {
		return this.prisma.analyticsZone.findMany({
			where: cameraId ? { cameraChannelId: cameraId } : undefined,
			include: {
				camera: {
					select: { id: true, name: true, device: { select: { name: true } } },
				},
				_count: { select: { events: true } },
			},
			orderBy: { name: "asc" },
		});
	}

	async createZone(dto: CreateZoneDto) {
		const camera = await this.prisma.cameraChannel.findUnique({
			where: { id: dto.cameraChannelId },
		});
		if (!camera) throw new NotFoundException("Kamera tidak ditemukan");

		return this.prisma.analyticsZone.create({
			data: {
				cameraChannelId: dto.cameraChannelId,
				name: dto.name,
				polygon: dto.polygon as unknown as Prisma.InputJsonValue,
				trackPosture: dto.trackPosture ?? false,
			},
		});
	}

	async updateZone(id: string, dto: UpdateZoneDto) {
		const zone = await this.prisma.analyticsZone.findUnique({ where: { id } });
		if (!zone) throw new NotFoundException("Zona tidak ditemukan");

		return this.prisma.analyticsZone.update({
			where: { id },
			data: {
				...(dto.name !== undefined && { name: dto.name }),
				...(dto.polygon !== undefined && {
					polygon: dto.polygon as unknown as Prisma.InputJsonValue,
				}),
				...(dto.trackPosture !== undefined && {
					trackPosture: dto.trackPosture,
				}),
				...(dto.enabled !== undefined && { enabled: dto.enabled }),
			},
		});
	}

	async removeZone(id: string) {
		const zone = await this.prisma.analyticsZone.findUnique({ where: { id } });
		if (!zone) throw new NotFoundException("Zona tidak ditemukan");
		return this.prisma.analyticsZone.delete({ where: { id } });
	}

	// ─── Module enable/disable ────────────────────────────────────

	async enableAnalytics(cameraId: string, mode: "POSE" | "FACE" = "POSE") {
		const camera = await this.prisma.cameraChannel.findUnique({
			where: { id: cameraId },
			include: { device: true },
		});
		if (!camera) throw new NotFoundException("Kamera tidak ditemukan");
		if (!camera.enabled)
			throw new BadRequestException(
				"Kamera harus aktif di dashboard sebelum analitik diaktifkan",
			);
		if (camera.device.archivedAt)
			throw new BadRequestException("Perangkat sudah diarsipkan");

		// Webcam (WHIP/ffmpeg) sudah punya path publisher di MediaMTX —
		// tidak perlu ensureAnalyticsPath yang butuh RTSP + credentials.
		if (
			(camera.device.type as string) !== "WEBCAM" &&
			(camera.device.type as string) !== "RTSP_DIRECT"
		) {
			await this.ensureAnalyticsPath(
				cameraId,
				camera.device.host,
				camera.device.rtspPort,
				camera.subStreamPath,
				this.credentials.decrypt(camera.device.usernameEncrypted),
				this.credentials.decrypt(camera.device.passwordEncrypted),
			);
		}

		return this.prisma.analyticsModuleStatus.upsert({
			where: { cameraChannelId: cameraId },
			create: {
				cameraChannelId: cameraId,
				analyticsEnabled: true,
				analyticsMode: mode,
			},
			update: {
				analyticsEnabled: true,
				analyticsMode: mode,
				workerStatus: "IDLE",
				lastErrorMessage: null,
			},
		});
	}

	async disableAnalytics(cameraId: string) {
		const status = await this.prisma.analyticsModuleStatus.findUnique({
			where: { cameraChannelId: cameraId },
		});
		if (!status) throw new NotFoundException("Analitik belum dikonfigurasi");

		// Hapus path MediaMTX agar tidak terus menarik stream tanpa viewer
		await this.removeAnalyticsPath(cameraId);

		return this.prisma.analyticsModuleStatus.update({
			where: { cameraChannelId: cameraId },
			data: { analyticsEnabled: false, workerStatus: "IDLE" },
		});
	}

	async getStatus(cameraId: string) {
		const status = await this.prisma.analyticsModuleStatus.findUnique({
			where: { cameraChannelId: cameraId },
			include: {
				camera: { select: { id: true, name: true, enabled: true } },
			},
		});
		if (!status)
			return {
				cameraChannelId: cameraId,
				analyticsEnabled: false,
				workerStatus: "IDLE",
			};
		return status;
	}

	async listCameraStatuses() {
		return this.prisma.analyticsModuleStatus.findMany({
			include: {
				camera: {
					select: {
						id: true,
						name: true,
						enabled: true,
						device: { select: { name: true } },
					},
				},
			},
			orderBy: { camera: { name: "asc" } },
		});
	}

	// ─── Events query ─────────────────────────────────────────────

	async listEvents(query: EventQueryDto) {
		const page = query.page ?? 1;
		const pageSize = 50;
		const where: Prisma.DwellEventWhereInput = {};

		if (query.zoneId) where.zoneId = query.zoneId;
		if (query.cameraId) where.zone = { cameraChannelId: query.cameraId };
		if (query.posture)
			where.posture = query.posture as "SITTING" | "STANDING" | "UNKNOWN";
		if (query.from || query.to) {
			where.enteredAt = {};
			if (query.from) where.enteredAt.gte = new Date(query.from);
			if (query.to) where.enteredAt.lte = new Date(query.to);
		}

		const [events, total] = await Promise.all([
			this.prisma.dwellEvent.findMany({
				where,
				include: {
					zone: {
						select: {
							id: true,
							name: true,
							cameraChannelId: true,
							camera: { select: { name: true } },
						},
					},
				},
				orderBy: { enteredAt: "desc" },
				skip: (page - 1) * pageSize,
				take: pageSize,
			}),
			this.prisma.dwellEvent.count({ where }),
		]);

		return {
			events,
			pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
		};
	}

	async getSummary(query: SummaryQueryDto) {
		const where: Prisma.DwellEventWhereInput = { exitedAt: { not: null } };

		if (query.zoneId) where.zoneId = query.zoneId;
		if (query.cameraId) where.zone = { cameraChannelId: query.cameraId };
		if (query.from || query.to) {
			where.enteredAt = {};
			if (query.from) where.enteredAt.gte = new Date(query.from);
			if (query.to) where.enteredAt.lte = new Date(query.to);
		}

		const [
			totalEvents,
			avgDuration,
			maxDuration,
			postureBreakdown,
			ongoingCount,
		] = await Promise.all([
			this.prisma.dwellEvent.count({ where }),
			this.prisma.dwellEvent.aggregate({
				where,
				_avg: { durationSeconds: true },
			}),
			this.prisma.dwellEvent.aggregate({
				where,
				_max: { durationSeconds: true },
			}),
			this.prisma.dwellEvent.groupBy({
				by: ["posture"],
				where,
				_count: true,
			}),
			this.prisma.dwellEvent.count({
				where: { ...where, exitedAt: null },
			}),
		]);

		return {
			totalEvents,
			ongoingEvents: ongoingCount,
			avgDurationSeconds: Math.round(avgDuration._avg.durationSeconds ?? 0),
			maxDurationSeconds: maxDuration._max.durationSeconds ?? 0,
			postureBreakdown: Object.fromEntries(
				postureBreakdown.map((p) => [p.posture ?? "UNKNOWN", p._count]),
			),
		};
	}

	// ─── Internal (worker-facing) ─────────────────────────────────

	async ingestEvents(dto: BatchEventsDto) {
		const now = new Date();
		const created = await this.prisma.$transaction(
			dto.events.map((event) =>
				this.prisma.dwellEvent.create({
					data: {
						zoneId: event.zoneId,
						trackRef: event.trackRef,
						posture:
							(event.posture as "SITTING" | "STANDING" | "UNKNOWN") ?? null,
						enteredAt: new Date(event.enteredAt),
						exitedAt: event.exitedAt ? new Date(event.exitedAt) : null,
						durationSeconds: event.durationSeconds ?? null,
					},
				}),
			),
		);

		await this.prisma.analyticsModuleStatus.updateMany({
			where: { cameraChannelId: dto.cameraChannelId },
			data: { lastEventAt: now, workerStatus: "RUNNING" },
		});

		return { ingested: created.length };
	}

	async getActiveCameras() {
		const statuses = await this.prisma.analyticsModuleStatus.findMany({
			where: { analyticsEnabled: true },
			include: {
				camera: {
					include: {
						analyticsZones: { where: { enabled: true } },
						device: { select: { type: true } },
					},
				},
			},
		});

		return statuses
			.filter((s) => s.camera.enabled)
			.map((s) => ({
				cameraChannelId: s.cameraChannelId,
				cameraName: s.camera.name,
				analyticsMode: s.analyticsMode,
				sampleIntervalMs: s.sampleIntervalMs,
				// Webcam/RTSP_DIRECT: baca langsung dari stream path
				rtspStreamPath:
					(s.camera.device?.type as string) === "WEBCAM" ||
					(s.camera.device?.type as string) === "RTSP_DIRECT"
						? s.camera.subStreamPath.replace(/^\//, "")
						: null,
				zones: s.camera.analyticsZones.map((z) => ({
					id: z.id,
					name: z.name,
					polygon: z.polygon,
					trackPosture: z.trackPosture,
				})),
			}));
	}

	/**
	 * Re-ensure path MediaMTX untuk semua kamera dengan analyticsEnabled=true.
	 * Menangani path lama tanpa kredensial dan path yang hilang setelah MediaMTX restart.
	 */
	async reconcileMediaMtxPaths(): Promise<{ repaired: number }> {
		const statuses = await this.prisma.analyticsModuleStatus.findMany({
			where: { analyticsEnabled: true },
			include: {
				camera: { include: { device: true } },
			},
		});

		let repaired = 0;
		for (const status of statuses) {
			const camera = status.camera;
			if (camera.device.archivedAt) continue;
			// Webcam: re-ensure publisher path selalu — terlepas dari camera.enabled
			if ((camera.device.type as string) === "WEBCAM") {
				await this.ensureWebcamPublisherPath(
					camera.subStreamPath.replace(/^\//, ""),
				);
				repaired += 1;
				continue;
			}
			// RTSP_DIRECT: re-ensure pull path di MediaMTX
			if ((camera.device.type as string) === "RTSP_DIRECT") {
				const pathName = camera.subStreamPath.replace(/^\//, "");
				// model field menyimpan URL RTSP asli
				const rtspUrl = camera.device.model ?? "";
				if (rtspUrl.startsWith("rtsp://")) {
					await this.ensureRtspDirectPath(pathName, rtspUrl);
					repaired += 1;
				}
				continue;
			}
			// NVR: skip jika kamera disabled
			if (!camera.enabled) continue;
			await this.ensureAnalyticsPath(
				camera.id,
				camera.device.host,
				camera.device.rtspPort,
				camera.subStreamPath,
				this.credentials.decrypt(camera.device.usernameEncrypted),
				this.credentials.decrypt(camera.device.passwordEncrypted),
			);
			repaired += 1;
		}
		return { repaired };
	}

	async updateWorkerStatus(
		cameraChannelId: string,
		workerStatus: "IDLE" | "RUNNING" | "ERROR",
		lastErrorMessage?: string,
	) {
		return this.prisma.analyticsModuleStatus.updateMany({
			where: { cameraChannelId },
			data: {
				workerStatus,
				...(lastErrorMessage !== undefined && { lastErrorMessage }),
			},
		});
	}

	// ─── Live state (overlay realtime) ────────────────────────────

	/** Simpan snapshot person boxes yang dipush worker. In-memory, best-effort. */
	storeLiveState(dto: LiveStateDto) {
		this.liveStates.set(dto.cameraChannelId, {
			tracks: dto.tracks.map((t) => ({
				trackRef: t.trackRef,
				bbox: t.bbox,
				posture: t.posture ?? null,
				zoneId: t.zoneId ?? null,
				durationSeconds: t.durationSeconds ?? 0,
			})),
			updatedAt: new Date(),
		});
		return { stored: dto.tracks.length };
	}

	/**
	 * Ambil live state kamera untuk overlay realtime di dashboard.
	 * Menggabungkan track aktif dengan definisi zona (nama + poligon)
	 * agar frontend cukup satu request polling.
	 */
	async getLiveState(cameraId: string) {
		const zones = await this.prisma.analyticsZone.findMany({
			where: { cameraChannelId: cameraId, enabled: true },
			select: { id: true, name: true, polygon: true, trackPosture: true },
		});

		const state = this.liveStates.get(cameraId);
		const stale =
			!state || Date.now() - state.updatedAt.getTime() > LIVE_STATE_TTL_MS;
		const tracks = stale ? [] : state.tracks;

		return {
			cameraId,
			zones: zones.map((z) => ({
				id: z.id,
				name: z.name,
				polygon: z.polygon,
				trackPosture: z.trackPosture,
			})),
			tracks,
			updatedAt: stale ? null : state!.updatedAt.toISOString(),
		};
	}

	async saveSnapshot(cameraChannelId: string, buffer: Buffer) {
		const dir = process.env.ANALYTICS_SNAPSHOT_DIR ?? "/tmp/snapshots";
		await mkdir(dir, { recursive: true });
		const filename = `${cameraChannelId}.jpg`;
		const filePath = join(dir, filename);
		await writeFile(filePath, buffer);

		await this.prisma.analyticsModuleStatus.updateMany({
			where: { cameraChannelId },
			data: { snapshotPath: filePath },
		});

		return { path: filePath };
	}

	getSnapshotStream(cameraChannelId: string) {
		const dir = process.env.ANALYTICS_SNAPSHOT_DIR ?? "/tmp/snapshots";
		const filePath = join(dir, `${cameraChannelId}.jpg`);
		if (!existsSync(filePath)) return null;
		return createReadStream(filePath);
	}

	// ─── MediaMTX analytics path ──────────────────────────────────

	private async removeAnalyticsPath(cameraId: string): Promise<void> {
		const base = process.env.MEDIAMTX_API_URL;
		if (!base) return;
		const pathName = `analytics-camera-${cameraId}-sub`;
		try {
			const encodedPath = encodeURIComponent(pathName);
			await fetch(`${base}/v3/config/paths/delete/${encodedPath}`, {
				method: "DELETE",
				signal: AbortSignal.timeout(5000),
			});
		} catch (error) {
			this.logger.warn(`Gagal menghapus MediaMTX path ${pathName}`, error);
		}
	}

	private async ensureAnalyticsPath(
		cameraId: string,
		host: string,
		rtspPort: number,
		subStreamPath: string,
		username: string,
		password: string,
	) {
		const base = process.env.MEDIAMTX_API_URL;
		if (!base) {
			this.logger.warn("MEDIAMTX_API_URL belum dikonfigurasi");
			return;
		}

		const pathName = `analytics-camera-${cameraId}-sub`;

		try {
			// Build RTSP source URL dengan kredensial perangkat (sama seperti StreamsService)
			const sourceUrl = new URL(`rtsp://${host}:${rtspPort}${subStreamPath}`);
			sourceUrl.username = username;
			sourceUrl.password = password;
			const source = sourceUrl.toString();

			const encodedPath = encodeURIComponent(pathName);
			const body = JSON.stringify({
				source,
				rtspTransport: "tcp",
				sourceOnDemand: false,
			});
			const headers = { "content-type": "application/json" };

			const addRes = await fetch(`${base}/v3/config/paths/add/${encodedPath}`, {
				method: "POST",
				headers,
				body,
				signal: AbortSignal.timeout(5000),
			});
			if (!addRes.ok) {
				const patchRes = await fetch(
					`${base}/v3/config/paths/patch/${encodedPath}`,
					{ method: "PATCH", headers, body, signal: AbortSignal.timeout(5000) },
				);
				if (!patchRes.ok)
					this.logger.warn(
						`MediaMTX path ${pathName} gagal dibuat: HTTP ${patchRes.status}`,
					);
			}
		} catch (error) {
			this.logger.warn("MediaMTX tidak tersedia untuk analytics path", error);
		}
	}

	/**
	 * Daftarkan/refresh path webcam publisher di MediaMTX.
	 * Dipanggil saat createWebcam, prepareWebcamPath, dan reconcile cron.
	 * sourceOnDemand: false = path selalu siap terima WHIP/ffmpeg push.
	 */
	/**
	 * Daftarkan/refresh path RTSP direct di MediaMTX.
	 * sourceOnDemand: true = MediaMTX pull dari source hanya saat ada viewer.
	 */
	async ensureRtspDirectPath(pathName: string, rtspUrl: string): Promise<void> {
		const base = process.env.MEDIAMTX_API_URL;
		if (!base) return;
		try {
			const enc = encodeURIComponent(pathName);
			const body = JSON.stringify({
				source: rtspUrl,
				rtspTransport: "tcp",
				sourceOnDemand: true,
			});
			const headers = { "content-type": "application/json" };
			const addRes = await fetch(`${base}/v3/config/paths/add/${enc}`, {
				method: "POST",
				headers,
				body,
				signal: AbortSignal.timeout(5000),
			});
			if (!addRes.ok) {
				await fetch(`${base}/v3/config/paths/patch/${enc}`, {
					method: "PATCH",
					headers,
					body,
					signal: AbortSignal.timeout(5000),
				});
			}
		} catch (error) {
			this.logger.warn(`Gagal ensure RTSP direct path ${pathName}`, error);
		}
	}

	async ensureWebcamPublisherPath(pathName: string): Promise<void> {
		const base = process.env.MEDIAMTX_API_URL;
		if (!base) return;
		try {
			const enc = encodeURIComponent(pathName);
			const body = JSON.stringify({ sourceOnDemand: false });
			const headers = { "content-type": "application/json" };
			const addRes = await fetch(`${base}/v3/config/paths/add/${enc}`, {
				method: "POST",
				headers,
				body,
				signal: AbortSignal.timeout(5000),
			});
			if (!addRes.ok) {
				await fetch(`${base}/v3/config/paths/patch/${enc}`, {
					method: "PATCH",
					headers,
					body,
					signal: AbortSignal.timeout(5000),
				});
			}
		} catch (error) {
			this.logger.warn(`Gagal ensure webcam path ${pathName}`, error);
		}
	}
}
