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

	async createSession(
		cameraId: string,
		quality: "main" | "sub",
		forwardedHost?: string,
	) {
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

		// Webcam (WHIP/ffmpeg): stream path langsung di MediaMTX
		// Path di-ensure oleh reconcile cron (AnalyticsReconcileService).
		// Tidak cek publisher aktif di sini — biarkan player handle 404 jika belum push.
		if ((camera.device.type as string) === "WEBCAM" || (camera.device.type as string) === "RTSP_DIRECT") {
			const webcamPath = camera.subStreamPath.replace(/^\//, "");
			const publicBase = this.buildPublicBase(forwardedHost);
			return {
				path: webcamPath,
				skipHevcCheck: true, // webcam pakai VP8/H264 bukan HEVC
				url: `${publicBase}/${webcamPath}?controls=false&muted=true&autoplay=true&playsInline=true`,
			};
		}

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
		const publicBase = this.buildPublicBase(forwardedHost);
		return {
			path: pathName,
			url: `${publicBase}/${pathName}?controls=false&muted=true&autoplay=true&playsInline=true`,
		};
	}

	private buildPublicBase(forwardedHost?: string): string {
		const webRtcPort = process.env.MEDIAMTX_WEBRTC_PORT;
		if (forwardedHost && webRtcPort) {
			try {
				const hostname = new URL(`http://${forwardedHost}`).hostname;
				return `http://${hostname}:${webRtcPort}`;
			} catch {
				// Host tidak valid; lanjut ke fallback.
			}
		}
		const fallback = process.env.MEDIAMTX_PUBLIC_WEBRTC_URL;
		if (!fallback)
			throw new BadRequestException(
				"MEDIAMTX_PUBLIC_WEBRTC_URL belum dikonfigurasi",
			);
		return fallback.replace(/\/$/, "");
	}
}
