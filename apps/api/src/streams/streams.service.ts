import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { CredentialsService } from "../common/credentials.service";
import { PrismaService } from "../database/prisma.service";
import { RtspProbeService } from "../hikvision/rtsp-probe.service";

@Injectable()
export class StreamsService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly credentials: CredentialsService,
		private readonly probe: RtspProbeService,
	) {}

	async createSession(cameraId: string, quality: "main" | "sub") {
		const camera = await this.prisma.cameraChannel.findUnique({
			where: { id: cameraId },
			include: { device: true },
		});
		if (!camera) throw new NotFoundException("Kamera tidak ditemukan");
		if (
			!camera.enabled ||
			camera.availability !== "AVAILABLE" ||
			camera.device.archivedAt
		)
			throw new BadRequestException("Kamera tidak aktif");
		const pathName = `camera-${camera.id}-${quality}`;
		const source = this.probe.buildUrl(
			{
				host: camera.device.host,
				httpPort: camera.device.httpPort,
				rtspPort: camera.device.rtspPort,
				username: this.credentials.decrypt(camera.device.usernameEncrypted),
				password: this.credentials.decrypt(camera.device.passwordEncrypted),
			},
			quality === "main" ? camera.mainStreamPath : camera.subStreamPath,
		);

		const base = process.env.MEDIAMTX_API_URL;
		if (!base)
			throw new BadRequestException("MEDIAMTX_API_URL belum dikonfigurasi");
		try {
			const encodedPath = encodeURIComponent(pathName);
			const options: RequestInit = {
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					source,
					rtspTransport: "tcp",
					sourceOnDemand: true,
				}),
				signal: AbortSignal.timeout(5000),
			};
			const addResponse = await fetch(
				`${base}/v3/config/paths/add/${encodedPath}`,
				{
					...options,
					method: "POST",
				},
			);
			if (!addResponse.ok) {
				const updateResponse = await fetch(
					`${base}/v3/config/paths/patch/${encodedPath}`,
					{
						...options,
						method: "PATCH",
					},
				);
				if (!updateResponse.ok)
					throw new Error(`MediaMTX HTTP ${updateResponse.status}`);
			}
		} catch {
			throw new BadRequestException("Media gateway tidak tersedia");
		}
		const publicWebRtcUrl = process.env.MEDIAMTX_PUBLIC_WEBRTC_URL;
		if (!publicWebRtcUrl)
			throw new BadRequestException(
				"MEDIAMTX_PUBLIC_WEBRTC_URL belum dikonfigurasi",
			);
		const publicBase = publicWebRtcUrl.replace(/\/$/, "");
		return {
			path: pathName,
			url: `${publicBase}/${pathName}?controls=false&muted=true&autoplay=true&playsInline=true`,
		};
	}
}
