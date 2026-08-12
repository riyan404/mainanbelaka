export const DASHBOARD_LAYOUTS = [1, 4, 9, 16] as const;
export type DashboardLayout = (typeof DASHBOARD_LAYOUTS)[number];

export const REQUIRED_VIDEO_CODEC = "hevc";

export function isRequiredVideoCodec(codec?: string): boolean {
	return codec?.toLowerCase() === REQUIRED_VIDEO_CODEC;
}

export function buildHikvisionStreamId(
	channel: number,
	quality: "main" | "sub",
): number {
	if (!Number.isInteger(channel) || channel < 1) {
		throw new RangeError("Channel harus bilangan bulat positif");
	}
	return channel * 100 + (quality === "main" ? 1 : 2);
}

export function buildHikvisionStreamPath(
	channel: number,
	quality: "main" | "sub",
): string {
	return `/Streaming/Channels/${buildHikvisionStreamId(channel, quality)}`;
}

export function sanitizeHost(host: string): string {
	const value = host.trim();
	if (
		!/^(?:[a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+$|^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)
	) {
		throw new Error("IP/hostname tidak valid");
	}
	return value;
}
