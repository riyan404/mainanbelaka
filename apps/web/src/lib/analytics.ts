import { api } from "./api";

// ─── Types ──────────────────────────────────────────────────────

export interface PolygonPoint {
	x: number;
	y: number;
}

export interface AnalyticsZone {
	id: string;
	cameraChannelId: string;
	name: string;
	polygon: PolygonPoint[];
	trackPosture: boolean;
	enabled: boolean;
	createdAt: string;
	updatedAt: string;
	camera?: { id: string; name: string; device?: { name: string } };
	_count?: { events: number };
}

export type AnalyticsMode = "POSE" | "FACE";

export interface AnalyticsModuleStatus {
	id: string;
	cameraChannelId: string;
	analyticsEnabled: boolean;
	analyticsMode: AnalyticsMode;
	sampleIntervalMs: number;
	lastEventAt?: string;
	workerStatus: "IDLE" | "RUNNING" | "ERROR";
	lastErrorMessage?: string;
	snapshotPath?: string;
	updatedAt: string;
	camera?: {
		id: string;
		name: string;
		enabled: boolean;
		device?: { name: string };
	};
}

export interface DwellEvent {
	id: string;
	zoneId: string;
	trackRef: string;
	posture: "SITTING" | "STANDING" | "UNKNOWN" | null;
	enteredAt: string;
	exitedAt?: string;
	durationSeconds?: number;
	createdAt: string;
	zone?: {
		id: string;
		name: string;
		cameraChannelId: string;
		camera?: { name: string };
	};
}

export interface EventsResponse {
	events: DwellEvent[];
	pagination: { page: number; pageSize: number; total: number; pages: number };
}

export interface AnalyticsSummary {
	totalEvents: number;
	ongoingEvents: number;
	avgDurationSeconds: number;
	maxDurationSeconds: number;
	postureBreakdown: Record<string, number>;
}

export interface LiveZone {
	id: string;
	name: string;
	polygon: PolygonPoint[];
	trackPosture: boolean;
}

export interface LiveTrack {
	trackRef: string;
	bbox: number[]; // [x1, y1, x2, y2] relative 0-1
	posture: "SITTING" | "STANDING" | "UNKNOWN" | null;
	zoneId: string | null;
	durationSeconds: number;
}

export interface CameraLiveState {
	cameraId: string;
	zones: LiveZone[];
	tracks: LiveTrack[];
	updatedAt: string | null;
}

// ─── API functions ──────────────────────────────────────────────

export function fetchZones(cameraId?: string) {
	const qs = cameraId ? `?cameraId=${cameraId}` : "";
	return api<AnalyticsZone[]>(`/analytics/zones${qs}`);
}

export function createZone(data: {
	cameraChannelId: string;
	name: string;
	polygon: PolygonPoint[];
	trackPosture?: boolean;
}) {
	return api<AnalyticsZone>("/analytics/zones", {
		method: "POST",
		body: JSON.stringify(data),
	});
}

export function updateZone(
	id: string,
	data: Partial<{
		name: string;
		polygon: PolygonPoint[];
		trackPosture: boolean;
		enabled: boolean;
	}>,
) {
	return api<AnalyticsZone>(`/analytics/zones/${id}`, {
		method: "PUT",
		body: JSON.stringify(data),
	});
}

export function deleteZone(id: string) {
	return api(`/analytics/zones/${id}`, { method: "DELETE" });
}

export function enableAnalytics(
	cameraId: string,
	mode: AnalyticsMode = "POSE",
) {
	return api<AnalyticsModuleStatus>(`/analytics/cameras/${cameraId}/enable`, {
		method: "POST",
		body: JSON.stringify({ mode }),
	});
}

export function disableAnalytics(cameraId: string) {
	return api<AnalyticsModuleStatus>(`/analytics/cameras/${cameraId}/disable`, {
		method: "POST",
	});
}

export function fetchAnalyticsStatus(cameraId: string) {
	return api<AnalyticsModuleStatus>(`/analytics/cameras/${cameraId}/status`);
}

export function fetchAllAnalyticsStatuses() {
	return api<AnalyticsModuleStatus[]>("/analytics/cameras/statuses");
}

export function fetchEvents(params: {
	zoneId?: string;
	cameraId?: string;
	from?: string;
	to?: string;
	posture?: string;
	page?: number;
}) {
	const qs = new URLSearchParams();
	if (params.zoneId) qs.set("zoneId", params.zoneId);
	if (params.cameraId) qs.set("cameraId", params.cameraId);
	if (params.from) qs.set("from", params.from);
	if (params.to) qs.set("to", params.to);
	if (params.posture) qs.set("posture", params.posture);
	if (params.page) qs.set("page", String(params.page));
	const str = qs.toString();
	return api<EventsResponse>(`/analytics/events${str ? `?${str}` : ""}`);
}

export function fetchSummary(params: {
	zoneId?: string;
	cameraId?: string;
	from?: string;
	to?: string;
}) {
	const qs = new URLSearchParams();
	if (params.zoneId) qs.set("zoneId", params.zoneId);
	if (params.cameraId) qs.set("cameraId", params.cameraId);
	if (params.from) qs.set("from", params.from);
	if (params.to) qs.set("to", params.to);
	const str = qs.toString();
	return api<AnalyticsSummary>(`/analytics/summary${str ? `?${str}` : ""}`);
}

export function getSnapshotUrl(cameraId: string) {
	return `/api/analytics/cameras/${cameraId}/snapshot`;
}

export function fetchCameraLiveState(cameraId: string) {
	return api<CameraLiveState>(`/analytics/cameras/${cameraId}/live`);
}
