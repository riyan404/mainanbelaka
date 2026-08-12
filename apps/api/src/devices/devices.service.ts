import {
	BadRequestException,
	Injectable,
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
		await this.requireDevice(id);
		return this.prisma.device.delete({ where: { id } });
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
