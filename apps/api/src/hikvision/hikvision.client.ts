import { BadGatewayException, Injectable } from "@nestjs/common";
import DigestClient from "digest-fetch";
import { buildHikvisionStreamPath } from "../common/domain";
import { parseChannels, parseDeviceInfo } from "./hikvision.parser";
import { RtspProbeService } from "./rtsp-probe.service";
import type { DetectionResult, HikvisionConnection } from "./hikvision.types";

async function mapWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results: R[] = [];
	let nextIndex = 0;

	const worker = async (): Promise<void> => {
		while (nextIndex < items.length) {
			const index = nextIndex;
			nextIndex += 1;
			const item = items[index];
			if (item === undefined) break;
			results[index] = await mapper(item, index);
		}
	};

	const workerCount = Math.min(concurrency, items.length);
	const workers: Promise<void>[] = [];
	for (let i = 0; i < workerCount; i += 1) {
		workers.push(worker());
	}
	await Promise.all(workers);
	return results;
}

@Injectable()
export class HikvisionClient {
	constructor(private readonly probe: RtspProbeService) {}

	private async get(
		connection: HikvisionConnection,
		path: string,
	): Promise<string> {
		const controller = new AbortController();
		const timer = setTimeout(
			() => controller.abort(),
			Number(process.env.RTSP_PROBE_TIMEOUT_MS ?? 8000),
		);
		try {
			const client = new DigestClient(connection.username, connection.password);
			const response = (await client.fetch(
				`http://${connection.host}:${connection.httpPort}${path}`,
				{
					signal: controller.signal,
					headers: { Accept: "application/xml" },
				},
			)) as Response;
			if (!response.ok)
				throw new Error(`Hikvision merespons HTTP ${response.status}`);
			return response.text();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Koneksi ISAPI gagal";
			throw new BadGatewayException(
				message.replace(connection.password, "[REDACTED]"),
			);
		} finally {
			clearTimeout(timer);
		}
	}

	private async detectChannelList(
		connection: HikvisionConnection,
	): Promise<ReturnType<typeof parseChannels>> {
		const paths = [
			"/ISAPI/ContentMgmt/InputProxy/channels",
			"/ISAPI/Streaming/channels",
		];
		for (const path of paths) {
			try {
				const channels = parseChannels(await this.get(connection, path));
				if (channels.length > 0) return channels;
			} catch {
				// Firmware berbeda dapat tidak mendukung salah satu endpoint.
			}
		}
		return [{ channelNumber: 1, sourceName: "Channel 1" }];
	}

	async detect(connection: HikvisionConnection): Promise<DetectionResult> {
		const device = parseDeviceInfo(
			await this.get(connection, "/ISAPI/System/deviceInfo"),
		);
		const channels = await this.detectChannelList(connection);
		const detected = await mapWithConcurrency(channels, 4, async (channel) => {
			const mainStreamPath = buildHikvisionStreamPath(
				channel.channelNumber,
				"main",
			);
			const subStreamPath = buildHikvisionStreamPath(
				channel.channelNumber,
				"sub",
			);
			const [main, sub] = await Promise.all([
				this.probe.probe(connection, mainStreamPath),
				this.probe.probe(connection, subStreamPath),
			]);
			return { ...channel, mainStreamPath, subStreamPath, main, sub };
		});
		return { device, channels: detected };
	}
}
