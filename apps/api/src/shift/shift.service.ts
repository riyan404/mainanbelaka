import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import type {
	CreateShiftDto,
	ShiftQueryDto,
	StaffReportQueryDto,
	UpdateShiftDto,
} from "./shift.dto";

@Injectable()
export class ShiftService {
	constructor(private readonly prisma: PrismaService) {}

	// ─── CRUD ──────────────────────────────────────────────────────────────────

	async createShift(dto: CreateShiftDto) {
		const start = new Date(dto.startTime);
		const end = new Date(dto.endTime);
		if (end <= start) {
			throw new BadRequestException("endTime harus setelah startTime");
		}

		// Pastikan kamera ada
		const camera = await this.prisma.cameraChannel.findUnique({
			where: { id: dto.cameraChannelId },
			select: { id: true, name: true },
		});
		if (!camera) {
			throw new NotFoundException(
				`Kamera ${dto.cameraChannelId} tidak ditemukan`,
			);
		}

		return this.prisma.shiftSchedule.create({
			data: {
				staffName: dto.staffName.trim(),
				cameraChannelId: dto.cameraChannelId,
				startTime: start,
				endTime: end,
				notes: dto.notes?.trim() ?? null,
			},
			include: { camera: { select: { id: true, name: true } } },
		});
	}

	async listShifts(query: ShiftQueryDto) {
		const where: Record<string, unknown> = {};
		if (query.staffName)
			where.staffName = { contains: query.staffName, mode: "insensitive" };
		if (query.cameraChannelId) where.cameraChannelId = query.cameraChannelId;
		if (query.from || query.to) {
			where.startTime = {
				...(query.from ? { gte: new Date(query.from) } : {}),
				...(query.to ? { lte: new Date(query.to) } : {}),
			};
		}

		const page = Math.max(1, query.page ?? 1);
		const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));

		const [items, total] = await Promise.all([
			this.prisma.shiftSchedule.findMany({
				where,
				orderBy: { startTime: "desc" },
				include: { camera: { select: { id: true, name: true } } },
				skip: (page - 1) * pageSize,
				take: pageSize,
			}),
			this.prisma.shiftSchedule.count({ where }),
		]);
		return {
			items,
			pagination: {
				page,
				pageSize,
				total,
				pages: Math.ceil(total / pageSize),
			},
		};
	}

	async getShift(id: string) {
		const shift = await this.prisma.shiftSchedule.findUnique({
			where: { id },
			include: { camera: { select: { id: true, name: true } } },
		});
		if (!shift) throw new NotFoundException("Shift tidak ditemukan");
		return shift;
	}

	async updateShift(id: string, dto: UpdateShiftDto) {
		await this.getShift(id); // 404 kalau tidak ada

		const data: Record<string, unknown> = {};
		if (dto.staffName !== undefined) data.staffName = dto.staffName.trim();
		if (dto.cameraChannelId !== undefined)
			data.cameraChannelId = dto.cameraChannelId;
		if (dto.startTime !== undefined) data.startTime = new Date(dto.startTime);
		if (dto.endTime !== undefined) data.endTime = new Date(dto.endTime);
		if (dto.notes !== undefined) data.notes = dto.notes.trim() || null;

		// Validasi urutan waktu jika keduanya diubah
		const updated = await this.prisma.shiftSchedule.findUniqueOrThrow({
			where: { id },
		});
		const finalStart =
			data.startTime instanceof Date ? data.startTime : updated.startTime;
		const finalEnd =
			data.endTime instanceof Date ? data.endTime : updated.endTime;
		if (finalEnd <= finalStart) {
			throw new BadRequestException("endTime harus setelah startTime");
		}

		return this.prisma.shiftSchedule.update({
			where: { id },
			data,
			include: { camera: { select: { id: true, name: true } } },
		});
	}

	async deleteShift(id: string) {
		await this.getShift(id);
		await this.prisma.shiftSchedule.delete({ where: { id } });
		return { deleted: true };
	}

	// ─── Laporan Harian ────────────────────────────────────────────────────────

	/**
	 * Laporan dwell kasir: per staf per hari, berapa menit benar-benar berada
	 * di depan PC (DwellEvent di zona kamera PC kasir).
	 *
	 * Logika join:
	 *   - Ambil semua ShiftSchedule dalam rentang [from, to]
	 *   - Untuk tiap shift, ambil DwellEvent di kamera yang sama yang
	 *     overlap dengan window shift (enteredAt >= shift.startTime &&
	 *     exitedAt <= shift.endTime)
	 *   - Jumlahkan durationSeconds sebagai "waktu hadir efektif"
	 */
	async getStaffReport(query: StaffReportQueryDto) {
		const fromDate = new Date(`${query.from}T00:00:00.000Z`);
		const toDate = new Date(`${query.to}T23:59:59.999Z`);

		// Fetch semua shift dalam range
		const shiftWhere: Record<string, unknown> = {
			startTime: { gte: fromDate },
			endTime: { lte: toDate },
		};
		if (query.staffName) {
			shiftWhere.staffName = {
				contains: query.staffName,
				mode: "insensitive",
			};
		}
		if (query.cameraChannelId) {
			shiftWhere.cameraChannelId = query.cameraChannelId;
		}

		const shifts = await this.prisma.shiftSchedule.findMany({
			where: shiftWhere,
			orderBy: [{ staffName: "asc" }, { startTime: "asc" }],
			include: { camera: { select: { id: true, name: true } } },
		});

		if (shifts.length === 0) return { rows: [], summary: [] };

		// Fetch semua zona yang terkait dengan kamera yang ada di shift
		const cameraIds = [...new Set(shifts.map((s) => s.cameraChannelId))];
		const zones = await this.prisma.analyticsZone.findMany({
			where: { cameraChannelId: { in: cameraIds }, enabled: true },
			select: { id: true, cameraChannelId: true, name: true },
		});
		const zoneIdsByCamera = new Map<string, string[]>();
		for (const z of zones) {
			const existing = zoneIdsByCamera.get(z.cameraChannelId) ?? [];
			existing.push(z.id);
			zoneIdsByCamera.set(z.cameraChannelId, existing);
		}

		// Fetch semua DwellEvent yang closed (durationSeconds != null) dalam range
		const allZoneIds = zones.map((z) => z.id);
		const dwellEvents =
			allZoneIds.length > 0
				? await this.prisma.dwellEvent.findMany({
						where: {
							zoneId: { in: allZoneIds },
							durationSeconds: { not: null },
							enteredAt: { gte: fromDate, lte: toDate },
						},
						select: {
							zoneId: true,
							enteredAt: true,
							exitedAt: true,
							durationSeconds: true,
							posture: true,
						},
					})
				: [];

		// Index events by zoneId
		const eventsByZone = new Map<string, typeof dwellEvents>();
		for (const ev of dwellEvents) {
			const list = eventsByZone.get(ev.zoneId) ?? [];
			list.push(ev);
			eventsByZone.set(ev.zoneId, list);
		}

		// Hitung per shift
		const rows = shifts.map((shift) => {
			const zoneIds = zoneIdsByCamera.get(shift.cameraChannelId) ?? [];

			let totalDwellSeconds = 0;
			let sittingSeconds = 0;
			let standingSeconds = 0;
			let eventCount = 0;

			for (const zoneId of zoneIds) {
				const events = eventsByZone.get(zoneId) ?? [];
				for (const ev of events) {
					// Hanya event yang overlap dengan window shift
					const inShift =
						ev.enteredAt >= shift.startTime &&
						(ev.exitedAt == null || ev.exitedAt <= shift.endTime);
					if (!inShift) continue;

					const dur = ev.durationSeconds ?? 0;
					totalDwellSeconds += dur;
					eventCount++;
					if (ev.posture === "SITTING") sittingSeconds += dur;
					if (ev.posture === "STANDING") standingSeconds += dur;
				}
			}

			const shiftDurationSeconds = Math.round(
				(shift.endTime.getTime() - shift.startTime.getTime()) / 1000,
			);
			const attendancePercent =
				shiftDurationSeconds > 0
					? Math.round((totalDwellSeconds / shiftDurationSeconds) * 100)
					: 0;

			return {
				id: shift.id,
				staffName: shift.staffName,
				camera: shift.camera,
				startTime: shift.startTime,
				endTime: shift.endTime,
				notes: shift.notes,
				shiftDurationSeconds,
				totalDwellSeconds,
				attendancePercent: Math.min(attendancePercent, 100),
				sittingSeconds,
				standingSeconds,
				eventCount,
			};
		});

		// Ringkasan per staf (agregat semua shift dalam range)
		const byStaff = new Map<
			string,
			{
				staffName: string;
				shiftCount: number;
				totalShiftSeconds: number;
				totalDwellSeconds: number;
				sittingSeconds: number;
				standingSeconds: number;
			}
		>();

		for (const row of rows) {
			const existing = byStaff.get(row.staffName) ?? {
				staffName: row.staffName,
				shiftCount: 0,
				totalShiftSeconds: 0,
				totalDwellSeconds: 0,
				sittingSeconds: 0,
				standingSeconds: 0,
			};
			existing.shiftCount++;
			existing.totalShiftSeconds += row.shiftDurationSeconds;
			existing.totalDwellSeconds += row.totalDwellSeconds;
			existing.sittingSeconds += row.sittingSeconds;
			existing.standingSeconds += row.standingSeconds;
			byStaff.set(row.staffName, existing);
		}

		const summary = [...byStaff.values()].map((s) => ({
			...s,
			avgAttendancePercent:
				s.totalShiftSeconds > 0
					? Math.min(
							Math.round((s.totalDwellSeconds / s.totalShiftSeconds) * 100),
							100,
						)
					: 0,
		}));

		return { rows, summary };
	}

	/** Daftar nama staf unik yang pernah terdaftar shift (untuk autocomplete UI). */
	async listStaffNames(): Promise<string[]> {
		const result = await this.prisma.shiftSchedule.findMany({
			select: { staffName: true },
			distinct: ["staffName"],
			orderBy: { staffName: "asc" },
		});
		return result.map((r) => r.staffName);
	}
}
