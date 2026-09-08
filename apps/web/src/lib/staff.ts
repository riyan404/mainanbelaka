import { api } from "./api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StaffFace {
	id: string;
	staffName: string;
	photoPath: string;
	embedding: string | null; // base64 embedding, null jika belum di-extract worker
	createdAt: string;
}

export interface FaceSettings {
	recognitionThreshold: number;
	unknownRetentionDays: number;
}

// ─── API calls ────────────────────────────────────────────────────────────────

/** Daftar nama staf unik yang sudah ter-enroll (punya foto di database). */
export async function fetchEnrolledStaffNames(): Promise<string[]> {
	return api<string[]>("/staff/faces/names");
}

/** Daftar semua foto staf (dengan status embedding). */
export async function fetchStaffFaces(
	staffName?: string,
): Promise<StaffFace[]> {
	const q = staffName ? `?staffName=${encodeURIComponent(staffName)}` : "";
	return api<StaffFace[]>(`/staff/faces${q}`);
}

export async function deleteStaffSlot(staffName: string): Promise<void> {
	await api(
		`/staff/faces/by-name/${encodeURIComponent(staffName)}`,
		{ method: "DELETE" },
	);
}

export async function fetchFaceSettings(): Promise<FaceSettings> {
	return api<FaceSettings>("/staff/settings");
}
