import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { ConnectionStatus, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { CredentialsService } from "../common/credentials.service";
import { sanitizeHost } from "../common/domain";
import { PrismaService } from "../database/prisma.service";
import { HikvisionClient } from "../hikvision/hikvision.client";
import type {
	DetectionResult,
	HikvisionConnection,
} from "../hikvision/hikvision.types";
import type {
	CreateDeviceDto,
	CreateRtspDeviceDto,
	CreateWebcamDeviceDto,
	DeviceConnectionDto,
	UpdateDeviceDto,
} from "./devices.dto";

interface PendingDetection {
	input: DeviceConnectionDto;
	result: DetectionResult;
	expiresAt: number;
}

@Injectable()
export class DevicesService {
	private readonly logger = new Logger(DevicesService.name);
	private readonly pending = new Map<string, PendingDetection>();

	constructor(
		private readonly prisma: PrismaService,
		private readonly hikvision: HikvisionClient,
		private readonly credentials: CredentialsService,
	) {}

	async list(archived = false) {
		return this.prisma.device.findMany({
			where: { archivedAt: archived ? { not: null } : null },
			include: { _count: { select: { cameras: true } } },
			orderBy: { name: "asc" },
		});
	}

	/**
	 * Registrasi webcam manual — tanpa Hikvision detect.
	 * Membuat Device WEBCAM + 1 CameraChannel dengan path MediaMTX yang diberikan.
	 * Host kosong karena tidak ada NVR; stream sudah tersedia di MediaMTX.
	 */
	/**
	 * Registrasi sumber RTSP langsung tanpa Hikvision ISAPI.
	 * MediaMTX pull dari URL RTSP yang diberikan, lalu expose ke player via WebRTC.
	 * Cocok untuk: screen capture, IP cam sederhana, encoder RTSP publik.
	 */
	async createRtspDirect(dto: CreateRtspDeviceDto) {
		// Parse URL untuk validasi dan ekstrak komponen
		let parsedUrl: URL;
		try {
			parsedUrl = new URL(dto.rtspUrl);
			if (parsedUrl.protocol !== "rtsp:") {
				throw new BadRequestException("URL harus menggunakan protokol rtsp://");
			}
		} catch (e) {
			if (e instanceof BadRequestException) throw e;
			throw new BadRequestException(`URL RTSP tidak valid: ${dto.rtspUrl}`);
		}

		const host = parsedUrl.hostname;
		const rtspPort = parsedUrl.port ? parseInt(parsedUrl.port, 10) : 554;
		const streamPath = parsedUrl.pathname; // mis. "/screenlive"

		// Gunakan path + host sebagai nama path MediaMTX (slugified)
		const slug =
			`rtsp-${host.replace(/[^a-zA-Z0-9]/g, "-")}-${streamPath.replace(/[^a-zA-Z0-9]/g, "-").replace(/^-+/, "")}`.toLowerCase();

		// Cek duplikat berdasarkan full RTSP URL (disimpan di field model)
		const existingByUrl = await this.prisma.device.findFirst({
			where: { model: dto.rtspUrl.trim() },
		});
		if (existingByUrl) {
			throw new BadRequestException(
				`URL RTSP '${dto.rtspUrl}' sudah terdaftar sebagai perangkat '${existingByUrl.name}'`,
			);
		}

		// @@unique([host, httpPort]) — untuk RTSP_DIRECT kita butuh nilai httpPort
		// yang unik per full URL. Gunakan hash sederhana dari full URL.
		const urlHash = this.hashUrlToPort(dto.rtspUrl.trim());
		// Pastikan tidak collision dengan device lain (sangat jarang, tapi handle)
		const existingByPort = await this.prisma.device.findUnique({
			where: { host_httpPort: { host, httpPort: urlHash } },
		});
		if (existingByPort) {
			throw new BadRequestException(
				`Tidak bisa mendaftarkan URL ini (hash collision dengan '${existingByPort.name}'). Coba ubah path URL.`,
			);
		}

		// Credentials kosong (RTSP tanpa auth)
		const emptyEnc = this.credentials.encrypt("");

		// Buat device + camera channel
		// httpPort = hash dari full URL agar @@unique([host, httpPort]) unik per URL
		const device = await this.prisma.device.create({
			data: {
				name: dto.name,
				type: "RTSP_DIRECT" as any, // eslint-disable-line @typescript-eslint/no-explicit-any
				host,
				httpPort: urlHash, // hash unik per full URL
				rtspPort,
				usernameEncrypted: emptyEnc,
				passwordEncrypted: emptyEnc,
				manufacturer: "RTSP",
				model: dto.rtspUrl,
				connectionStatus: ConnectionStatus.ONLINE,
				lastCheckedAt: new Date(),
				cameras: {
					create: {
						channelNumber: 1,
						name: dto.location ?? dto.name,
						location: dto.location,
						mainStreamPath: `/${slug}`,
						subStreamPath: `/${slug}`,
						enabled: true,
						connectionStatus: ConnectionStatus.ONLINE,
						lastTestedAt: new Date(),
					},
				},
			},
		});

		// Daftarkan path di MediaMTX dengan source RTSP langsung
		await this.ensureRtspDirectPath(slug, dto.rtspUrl);

		return this.prisma.device.findUnique({
			where: { id: device.id },
			include: { cameras: true },
		});
	}

	/**
	 * Hash full RTSP URL ke port integer (10000–62000) untuk @@unique([host, httpPort]).
	 * Setiap URL berbeda menghasilkan nilai berbeda sehingga multi-stream dari
	 * host yang sama bisa terdaftar tanpa conflict.
	 */
	private hashUrlToPort(url: string): number {
		let h = 0x811c9dc5;
		for (let i = 0; i < url.length; i++) {
			h ^= url.charCodeAt(i);
			h = Math.imul(h, 0x01000193) >>> 0;
		}
		// Clamp ke 10000–62000 agar tidak bertabrakan dengan port HTTP biasa
		return 10000 + (h % 52000);
	}

	/**
	 * Daftarkan/refresh path RTSP direct di MediaMTX.
	 * source = URL RTSP asli, sourceOnDemand = true (pull hanya saat ada viewer).
	 */
	private async ensureRtspDirectPath(
		pathName: string,
		rtspUrl: string,
	): Promise<void> {
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
			this.logger.warn(
				`Gagal mendaftarkan RTSP direct path ${pathName}`,
				error,
			);
		}
	}

	async createWebcam(dto: CreateWebcamDeviceDto) {
		// Cek duplikat berdasarkan stream path
		const existing = await this.prisma.cameraChannel.findFirst({
			where: { mainStreamPath: `/${dto.streamPath.replace(/^\//, "")}` },
		});
		if (existing) {
			throw new BadRequestException(
				`Stream path '${dto.streamPath}' sudah terdaftar`,
			);
		}

		const normalizedPath = `/${dto.streamPath.replace(/^\//, "")}`;

		// Buat placeholder credentials (kosong, terenkripsi)
		const emptyEnc = this.credentials.encrypt("");

		const device = await this.prisma.device.create({
			data: {
				name: dto.name,
				type: "WEBCAM",
				host: "localhost", // placeholder; stream dari MediaMTX lokal
				httpPort: 80,
				rtspPort: 8554,
				usernameEncrypted: emptyEnc,
				passwordEncrypted: emptyEnc,
				manufacturer: "Webcam",
				model: dto.streamPath,
				connectionStatus: ConnectionStatus.ONLINE,
				lastCheckedAt: new Date(),
				cameras: {
					create: {
						channelNumber: 1,
						name: dto.location ?? dto.name,
						location: dto.location,
						mainStreamPath: normalizedPath,
						subStreamPath: normalizedPath,
						enabled: true,
						connectionStatus: ConnectionStatus.ONLINE,
						lastTestedAt: new Date(),
					},
				},
			},
			include: { cameras: true },
		});

		// Daftarkan path di MediaMTX sebagai publisher (tanpa source = browser push via WHIP)
		await this.ensureWebcamPath(dto.streamPath.replace(/^\//, ""));

		return device;
	}

	/**
	 * Daftarkan path webcam di MediaMTX sebagai publisher.
	 * sourceOnDemand: false wajib — path harus aktif sebelum browser push via WHIP.
	 */
	/** Daftarkan path webcam di MediaMTX tanpa menyimpan ke DB (dipanggil sebelum WHIP start). */
	async prepareWebcamPath(streamPath: string): Promise<{ ok: boolean }> {
		const pathName = streamPath.replace(/^\//, "");
		await this.ensureWebcamPath(pathName);
		return { ok: true };
	}

	private async ensureWebcamPath(pathName: string): Promise<void> {
		const base = process.env.MEDIAMTX_API_URL;
		if (!base) return; // dev tanpa MediaMTX
		try {
			const encodedPath = encodeURIComponent(pathName);
			const body = JSON.stringify({ sourceOnDemand: false });
			const headers = { "content-type": "application/json" };
			// Coba add dulu, kalau sudah ada (409/400) coba patch
			const addRes = await fetch(`${base}/v3/config/paths/add/${encodedPath}`, {
				method: "POST",
				headers,
				body,
				signal: AbortSignal.timeout(5000),
			});
			if (!addRes.ok) {
				await fetch(`${base}/v3/config/paths/patch/${encodedPath}`, {
					method: "PATCH",
					headers,
					body,
					signal: AbortSignal.timeout(5000),
				});
			}
		} catch (error) {
			// Non-fatal: log saja, browser akan mendapat error WHIP yang informatif
			this.logger.warn(
				`Gagal mendaftarkan webcam path ${pathName} di MediaMTX`,
				error,
			);
		}
	}

	async testDetect(input: DeviceConnectionDto) {
		const normalized = { ...input, host: sanitizeHost(input.host) };
		const result = await this.hikvision.detect(normalized);
		const token = randomUUID();
		const ttl = Number(process.env.DETECTION_TTL_MS ?? 600000);
		const now = Date.now();
		for (const [pendingToken, detection] of this.pending) {
			if (detection.expiresAt < now) this.pending.delete(pendingToken);
		}
		this.pending.set(token, {
			input: normalized,
			result,
			expiresAt: now + ttl,
		});
		return { detectionToken: token, ...result };
	}

	async create(dto: CreateDeviceDto) {
		const pending = this.pending.get(dto.detectionToken);
		if (!pending || pending.expiresAt < Date.now())
			throw new BadRequestException("Hasil deteksi kedaluwarsa");
		if (
			pending.input.host !== sanitizeHost(dto.host) ||
			pending.input.type !== dto.type ||
			pending.input.httpPort !== dto.httpPort ||
			pending.input.rtspPort !== dto.rtspPort ||
			pending.input.username !== dto.username ||
			pending.input.password !== dto.password
		) {
			throw new BadRequestException(
				"Data koneksi berubah; jalankan Test & Detect ulang",
			);
		}
		const result = await this.prisma.device.create({
			data: {
				name: dto.name,
				type: dto.type,
				host: pending.input.host,
				httpPort: dto.httpPort,
				rtspPort: dto.rtspPort,
				usernameEncrypted: this.credentials.encrypt(dto.username),
				passwordEncrypted: this.credentials.encrypt(dto.password),
				manufacturer: pending.result.device.manufacturer,
				model: pending.result.device.model,
				serialNumber: pending.result.device.serialNumber,
				firmwareVersion: pending.result.device.firmwareVersion,
				connectionStatus: ConnectionStatus.ONLINE,
				lastCheckedAt: new Date(),
				cameras: {
					create: pending.result.channels.map((channel) => ({
						channelNumber: channel.channelNumber,
						name: channel.sourceName || `Channel ${channel.channelNumber}`,
						mainStreamPath: channel.mainStreamPath,
						subStreamPath: channel.subStreamPath,
						mainCodec: channel.main.codec,
						subCodec: channel.sub.codec,
						mainResolution: channel.main.resolution,
						subResolution: channel.sub.resolution,
						mainFps: channel.main.fps,
						subFps: channel.sub.fps,
						connectionStatus:
							channel.main.available && channel.sub.available
								? ConnectionStatus.ONLINE
								: ConnectionStatus.OFFLINE,
					})),
				},
			},
			include: { cameras: true },
		});
		this.pending.delete(dto.detectionToken);
		return result;
	}

	async update(id: string, dto: UpdateDeviceDto) {
		await this.requireDevice(id);
		return this.prisma.device.update({ where: { id }, data: dto });
	}

	async archive(id: string) {
		await this.requireDevice(id);
		return this.prisma.$transaction([
			this.prisma.cameraChannel.updateMany({
				where: { deviceId: id },
				data: { enabled: false },
			}),
			this.prisma.device.update({
				where: { id },
				data: { archivedAt: new Date() },
			}),
		]);
	}

	async restore(id: string) {
		await this.requireDevice(id);
		return this.prisma.device.update({
			where: { id },
			data: { archivedAt: null, connectionStatus: ConnectionStatus.UNTESTED },
		});
	}

	async remove(id: string) {
		const device = await this.requireDevice(id);
		// Hapus MediaMTX path jika webcam
		if (device.type === "WEBCAM") {
			const cameras = await this.prisma.cameraChannel.findMany({
				where: { deviceId: id },
				select: { mainStreamPath: true },
			});
			for (const cam of cameras) {
				const pathName = cam.mainStreamPath.replace(/^\//, "");
				await this.removeWebcamPath(pathName);
			}
		}
		return this.prisma.device.delete({ where: { id } });
	}

	private async removeWebcamPath(pathName: string): Promise<void> {
		const base = process.env.MEDIAMTX_API_URL;
		if (!base) return;
		try {
			await fetch(
				`${base}/v3/config/paths/delete/${encodeURIComponent(pathName)}`,
				{ method: "DELETE", signal: AbortSignal.timeout(5000) },
			);
		} catch {
			// Non-fatal
		}
	}

	async redetect(id: string) {
		const device = await this.requireDevice(id);
		const connection = this.toConnection(device);
		const result = await this.hikvision.detect(connection);
		const found = new Set(
			result.channels.map((channel) => channel.channelNumber),
		);
		await this.prisma.$transaction([
			this.prisma.cameraChannel.updateMany({
				where: { deviceId: id, channelNumber: { notIn: [...found] } },
				data: { availability: "UNAVAILABLE" },
			}),
			...result.channels.map((channel) =>
				this.prisma.cameraChannel.upsert({
					where: {
						deviceId_channelNumber: {
							deviceId: id,
							channelNumber: channel.channelNumber,
						},
					},
					create: {
						deviceId: id,
						channelNumber: channel.channelNumber,
						name: channel.sourceName || `Channel ${channel.channelNumber}`,
						mainStreamPath: channel.mainStreamPath,
						subStreamPath: channel.subStreamPath,
						mainCodec: channel.main.codec,
						subCodec: channel.sub.codec,
						mainResolution: channel.main.resolution,
						subResolution: channel.sub.resolution,
						mainFps: channel.main.fps,
						subFps: channel.sub.fps,
						connectionStatus:
							channel.main.available && channel.sub.available
								? "ONLINE"
								: "OFFLINE",
					},
					update: {
						availability: "AVAILABLE",
						mainStreamPath: channel.mainStreamPath,
						subStreamPath: channel.subStreamPath,
						mainCodec: channel.main.codec,
						subCodec: channel.sub.codec,
						mainResolution: channel.main.resolution,
						subResolution: channel.sub.resolution,
						mainFps: channel.main.fps,
						subFps: channel.sub.fps,
						connectionStatus:
							channel.main.available && channel.sub.available
								? "ONLINE"
								: "OFFLINE",
						lastTestedAt: new Date(),
					},
				}),
			),
		]);
		return result;
	}

	private async requireDevice(id: string) {
		const device = await this.prisma.device.findUnique({ where: { id } });
		if (!device) throw new NotFoundException("Perangkat tidak ditemukan");
		return device;
	}

	private toConnection(
		device: Prisma.DeviceGetPayload<object>,
	): HikvisionConnection {
		return {
			host: device.host,
			httpPort: device.httpPort,
			rtspPort: device.rtspPort,
			username: this.credentials.decrypt(device.usernameEncrypted),
			password: this.credentials.decrypt(device.passwordEncrypted),
		};
	}
}
