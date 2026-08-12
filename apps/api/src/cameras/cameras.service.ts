import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { CredentialsService } from "../common/credentials.service";
import { isRequiredVideoCodec } from "../common/domain";
import { PrismaService } from "../database/prisma.service";
import { RtspProbeService } from "../hikvision/rtsp-probe.service";
import type { UpdateCameraDto } from "./cameras.dto";

@Injectable()
export class CamerasService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly credentials: CredentialsService,
		private readonly probe: RtspProbeService,
	) {}

	list(search?: string, enabled?: boolean) {
		return this.prisma.cameraChannel.findMany({
			where: {
				...(enabled === undefined ? {} : { enabled }),
				...(search
					? {
							OR: [
								{ name: { contains: search, mode: "insensitive" } },
								{ location: { contains: search, mode: "insensitive" } },
								{ device: { name: { contains: search, mode: "insensitive" } } },
							],
						}
					: {}),
			},
			include: {
				device: {
					select: { id: true, name: true, host: true, archivedAt: true },
				},
				groups: { include: { group: true } },
			},
			orderBy: { name: "asc" },
		});
	}

	async update(id: string, dto: UpdateCameraDto) {
		await this.requireCamera(id);
		const { groupIds, ...data } = dto;
		return this.prisma.$transaction(async (tx) => {
			if (groupIds) {
				await tx.cameraGroup.deleteMany({ where: { cameraChannelId: id } });
				if (groupIds.length) {
					await tx.cameraGroup.createMany({
						data: groupIds.map((groupId) => ({ cameraChannelId: id, groupId })),
						skipDuplicates: true,
					});
				}
			}
			return tx.cameraChannel.update({
				where: { id },
				data,
				include: { groups: { include: { group: true } } },
			});
		});
	}

	async test(id: string) {
		const camera = await this.requireCamera(id);
		const connection = {
			host: camera.device.host,
			httpPort: camera.device.httpPort,
			rtspPort: camera.device.rtspPort,
			username: this.credentials.decrypt(camera.device.usernameEncrypted),
			password: this.credentials.decrypt(camera.device.passwordEncrypted),
		};
		const [main, sub] = await Promise.all([
			this.probe.probe(connection, camera.mainStreamPath),
			this.probe.probe(connection, camera.subStreamPath),
		]);
		const valid =
			main.available &&
			sub.available &&
			isRequiredVideoCodec(main.codec) &&
			isRequiredVideoCodec(sub.codec);
		await this.prisma.cameraChannel.update({
			where: { id },
			data: {
				mainCodec: main.codec,
				subCodec: sub.codec,
				mainResolution: main.resolution,
				subResolution: sub.resolution,
				mainFps: main.fps,
				subFps: sub.fps,
				connectionStatus: valid ? "ONLINE" : "OFFLINE",
				lastTestedAt: new Date(),
			},
		});
		return { valid, main, sub };
	}

	async setEnabled(id: string, enabled: boolean) {
		const camera = await this.requireCamera(id);
		if (enabled) {
			if (camera.availability !== "AVAILABLE" || camera.device.archivedAt)
				throw new BadRequestException("Kamera tidak tersedia");
			const result = await this.test(id);
			if (!result.valid) {
				const failures = [
					!result.main.available || !isRequiredVideoCodec(result.main.codec)
						? `main=${result.main.codec ?? "tidak tersedia"}`
						: undefined,
					!result.sub.available || !isRequiredVideoCodec(result.sub.codec)
						? `sub=${result.sub.codec ?? "tidak tersedia"}`
						: undefined,
				].filter(Boolean);
				throw new BadRequestException(
					`Main dan sub-stream wajib H.265/HEVC. Gagal: ${failures.join(", ")}`,
				);
			}
		}
		const updated = await this.prisma.cameraChannel.update({
			where: { id },
			data: { enabled },
		});
		if (enabled) await this.assignDefaultGroupWhenUngrouped(id);
		return updated;
	}

	private async assignDefaultGroupWhenUngrouped(
		cameraChannelId: string,
	): Promise<void> {
		const membershipCount = await this.prisma.cameraGroup.count({
			where: { cameraChannelId },
		});
		if (membershipCount > 0) return;
		const defaultGroup = await this.prisma.group.findFirst({
			where: { isDefault: true },
			select: { id: true },
		});
		if (!defaultGroup) return;
		await this.prisma.cameraGroup.upsert({
			where: {
				cameraChannelId_groupId: {
					cameraChannelId,
					groupId: defaultGroup.id,
				},
			},
			create: { cameraChannelId, groupId: defaultGroup.id },
			update: {},
		});
	}

	private async requireCamera(id: string) {
		const camera = await this.prisma.cameraChannel.findUnique({
			where: { id },
			include: { device: true },
		});
		if (!camera) throw new NotFoundException("Kamera tidak ditemukan");
		return camera;
	}
}
