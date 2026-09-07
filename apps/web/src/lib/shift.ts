import { api } from "./api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShiftCamera {
	id: string;
	name: string;
}

export interface ShiftSchedule {
	id: string;
	staffName: string;
	cameraChannelId: string;
	startTime: string;
	endTime: string;
	notes: string | null;
	createdAt: string;
	updatedAt: string;
	camera: ShiftCamera;
}

export interface ShiftReportRow {
	id: string;
	staffName: string;
	camera: ShiftCamera;
	startTime: string;
	endTime: string;
	notes: string | null;
	shiftDurationSeconds: number;
	totalDwellSeconds: number;
	attendancePercent: number;
	sittingSeconds: number;
	standingSeconds: number;
	eventCount: number;
}

export interface StaffSummary {
	staffName: string;
	shiftCount: number;
	totalShiftSeconds: number;
	totalDwellSeconds: number;
	sittingSeconds: number;
	standingSeconds: number;
	avgAttendancePercent: number;
}

export interface StaffReport {
	rows: ShiftReportRow[];
	summary: StaffSummary[];
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function fetchShifts(params?: {
	staffName?: string;
	cameraChannelId?: string;
	from?: string;
	to?: string;
	page?: number;
	pageSize?: number;
}): Promise<import("./api").Paginated<ShiftSchedule>> {
	const q = new URLSearchParams();
	if (params?.staffName) q.set("staffName", params.staffName);
	if (params?.cameraChannelId) q.set("cameraChannelId", params.cameraChannelId);
	if (params?.from) q.set("from", params.from);
	if (params?.to) q.set("to", params.to);
	if (params?.page) q.set("page", String(params.page));
	if (params?.pageSize) q.set("pageSize", String(params.pageSize));
	const qs = q.toString();
	return api<import("./api").Paginated<ShiftSchedule>>(
		`/shifts${qs ? `?${qs}` : ""}`,
	);
}

export async function createShift(data: {
	staffName: string;
	cameraChannelId: string;
	startTime: string;
	endTime: string;
	notes?: string;
}): Promise<ShiftSchedule> {
	return api<ShiftSchedule>("/shifts", {
		method: "POST",
		body: JSON.stringify(data),
	});
}

export async function updateShift(
	id: string,
	data: Partial<{
		staffName: string;
		cameraChannelId: string;
		startTime: string;
		endTime: string;
		notes: string;
	}>,
): Promise<ShiftSchedule> {
	return api<ShiftSchedule>(`/shifts/${id}`, {
		method: "PUT",
		body: JSON.stringify(data),
	});
}

export async function deleteShift(id: string): Promise<void> {
	await api(`/shifts/${id}`, { method: "DELETE" });
}

export async function fetchStaffNames(): Promise<string[]> {
	return api<string[]>("/shifts/staff-names");
}

export async function fetchStaffReport(params: {
	staffName?: string;
	cameraChannelId?: string;
	from: string;
	to: string;
}): Promise<StaffReport> {
	const q = new URLSearchParams({ from: params.from, to: params.to });
	if (params.staffName) q.set("staffName", params.staffName);
	if (params.cameraChannelId) q.set("cameraChannelId", params.cameraChannelId);
	return api<StaffReport>(`/shifts/report?${q.toString()}`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatDuration(seconds: number): string {
	if (seconds < 60) return `${seconds}d`;
	const mins = Math.floor(seconds / 60);
	if (mins < 60) return `${mins}m`;
	const hours = Math.floor(mins / 60);
	const rem = mins % 60;
	return rem > 0 ? `${hours}j ${rem}m` : `${hours}j`;
}

export function formatShiftTime(iso: string): string {
	return new Date(iso).toLocaleString("id-ID", {
		day: "2-digit",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/** Hari ini dalam format YYYY-MM-DD (local time) */
export function todayLocal(): string {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
