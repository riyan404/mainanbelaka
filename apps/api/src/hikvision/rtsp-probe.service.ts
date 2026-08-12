import { Injectable } from "@nestjs/common";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isRequiredVideoCodec } from "../common/domain";
import type { HikvisionConnection, StreamProbe } from "./hikvision.types";

const execFileAsync = promisify(execFile);

@Injectable()
export class RtspProbeService {
	buildUrl(connection: HikvisionConnection, path: string): string {
		try {
			const url = new URL(
				`rtsp://${connection.host}:${connection.rtspPort}${path}`,
			);
			url.username = connection.username;
			url.password = connection.password;
			return url.toString();
		} catch {
			throw new Error("Konfigurasi RTSP tidak valid");
		}
	}

	async probe(
		connection: HikvisionConnection,
		path: string,
	): Promise<StreamProbe> {
		const url = this.buildUrl(connection, path);
		const timeout = Number(process.env.RTSP_PROBE_TIMEOUT_MS ?? 8000);
		try {
			const { stdout } = await execFileAsync(
				"ffprobe",
				[
					"-v",
					"error",
					"-rtsp_transport",
					"tcp",
					"-select_streams",
					"v:0",
					"-show_entries",
					"stream=codec_name,width,height,avg_frame_rate",
					"-of",
					"json",
					url,
				],
				{ timeout, maxBuffer: 1024 * 1024 },
			);
			const output = JSON.parse(stdout) as {
				streams?: Array<Record<string, unknown>>;
			};
			const stream = output.streams?.[0];
			if (!stream)
				return { available: false, error: "Video stream tidak ditemukan" };
			const codec =
				typeof stream.codec_name === "string"
					? stream.codec_name.toLowerCase()
					: "";
			const width = Number(stream.width ?? 0);
			const height = Number(stream.height ?? 0);
			const frameRate =
				typeof stream.avg_frame_rate === "string"
					? stream.avg_frame_rate
					: "0/1";
			const [numerator, denominator] = frameRate.split("/").map(Number);
			return {
				available: true,
				codec,
				resolution: width && height ? `${width}x${height}` : undefined,
				fps: numerator && denominator ? numerator / denominator : undefined,
				error: !isRequiredVideoCodec(codec)
					? "Codec wajib H.265/HEVC"
					: undefined,
			};
		} catch (error) {
			const message =
				error instanceof Error
					? error.message.replaceAll(url, "[REDACTED_RTSP_URL]")
					: "RTSP gagal";
			return { available: false, error: message.slice(0, 240) };
		}
	}
}
