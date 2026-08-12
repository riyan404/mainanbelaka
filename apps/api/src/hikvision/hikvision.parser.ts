import { XMLParser } from "fast-xml-parser";
import type { DetectedChannel, HikvisionDeviceInfo } from "./hikvision.types";

const parser = new XMLParser({
	ignoreAttributes: false,
	removeNSPrefix: true,
	parseTagValue: true,
});

type XmlRecord = Record<string, unknown>;

function asText(value: unknown): string | undefined {
	return typeof value === "string" || typeof value === "number"
		? String(value)
		: undefined;
}

function asRecord(value: unknown): XmlRecord | undefined {
	return typeof value === "object" && value !== null
		? (value as XmlRecord)
		: undefined;
}

function asRecordArray(value: unknown): XmlRecord[] {
	const values = Array.isArray(value)
		? value
		: value === undefined
			? []
			: [value];
	return values
		.map(asRecord)
		.filter((item): item is XmlRecord => item !== undefined);
}

export function parseDeviceInfo(xml: string): HikvisionDeviceInfo {
	const root = parser.parse(xml) as { DeviceInfo?: Record<string, unknown> };
	const info = root.DeviceInfo ?? {};
	return {
		manufacturer:
			typeof info.deviceName === "string" ? info.deviceName : "Hikvision",
		model: asText(info.model),
		serialNumber: asText(info.serialNumber),
		firmwareVersion: asText(info.firmwareVersion),
	};
}

export function parseChannels(xml: string): DetectedChannel[] {
	const root = parser.parse(xml) as XmlRecord;
	const inputProxy = asRecord(root.InputProxyChannelList);
	const streamingList = asRecord(root.StreamingChannelList);
	const proxy = asRecordArray(inputProxy?.InputProxyChannel);
	const streaming = asRecordArray(streamingList?.StreamingChannel);
	const raw = proxy.length > 0 ? proxy : streaming;
	const channels = new Map<number, DetectedChannel>();

	for (const item of raw) {
		const id = Number(
			item.id ?? item.inputProxyChannelID ?? item.videoInputChannelID,
		);
		if (!Number.isFinite(id) || id < 1) continue;
		const channelNumber = id >= 100 ? Math.floor(id / 100) : id;
		const descriptor = asRecord(item.sourceInputPortDescriptor);
		const sourceName = asText(item.name) ?? asText(descriptor?.proxyProtocol);
		if (!channels.has(channelNumber)) {
			channels.set(channelNumber, { channelNumber, sourceName });
		}
	}
	return [...channels.values()].sort(
		(a, b) => a.channelNumber - b.channelNumber,
	);
}
