import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import * as fs from "node:fs";
import * as path from "node:path";
import { PrismaService } from "../database/prisma.service";
import type {
	CreateStaffFaceDto,
	StaffQueryDto,
	UpsertSettingDto,
} from "./staff.dto";

/** Direktori penyimpanan foto wajah staf */
const FACE_UPLOAD_DIR = process.env.STAFF_FACE_DIR ?? "/tmp/staff-faces";

@Injectable()
export class StaffService {
	constructor(private readonly prisma: PrismaService) {
		// Pastikan direktori ada
		fs.mkdirSync(FACE_UPLOAD_DIR, { recursive: true });
	}

	// ─── Staff Face CRUD ─────────────────────────────────────────────────────

	async createFace(dto: CreateStaffFaceDto, file: Express.Multer.File) {
		if (!file) {
			throw new BadRequestException("File foto wajib di-upload");
		}

		const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
		const allowed = [".jpg", ".jpeg", ".png", ".webp"];
		if (!allowed.includes(ext)) {
			throw new BadRequestException(
				`Format file tidak didukung: ${ext}. Gunakan ${allowed.join(", ")}`,
			);
		}

		// Simpan file
		const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
		const filePath = path.join(FACE_UPLOAD_DIR, filename);
		fs.writeFileSync(filePath, file.buffer);

		// Simpan ke DB — embedding diisi oleh worker saat sync
		return this.prisma.staffFace.create({
			data: {
				staffName: dto.staffName.trim(),
				photoPath: filePath,
				embedding: [], // Kosong dulu, diisi worker via internal endpoint
			},
		});
	}

	async listFaces(query?: StaffQueryDto) {
		const where: Record<string, unknown> = {};
		if (query?.staffName) {
			where.staffName = { contains: query.staffName, mode: "insensitive" };
		}
		return this.prisma.staffFace.findMany({
			where,
			orderBy: [{ staffName: "asc" }, { createdAt: "desc" }],
			select: {
				id: true,
				staffName: true,
				photoPath: true,
				createdAt: true,
				updatedAt: true,
				// embedding sengaja TIDAK dikembalikan (besar, tidak perlu di UI)
			},
		});
	}

	/** Daftar nama staf unik yang sudah punya foto enrollment. */
	async listEnrolledNames(): Promise<string[]> {
		const result = await this.prisma.staffFace.findMany({
			select: { staffName: true },
			distinct: ["staffName"],
			orderBy: { staffName: "asc" },
		});
		return result.map((r) => r.staffName);
	}

	async deleteFace(id: string) {
		const face = await this.prisma.staffFace.findUnique({ where: { id } });
		if (!face) throw new NotFoundException("Data wajah tidak ditemukan");

		// Hapus file fisik
		try {
			fs.unlinkSync(face.photoPath);
		} catch {
			// Abaikan jika file sudah tidak ada
		}

		await this.prisma.staffFace.delete({ where: { id } });
		return { deleted: true };
	}

	async deleteStaffSlot(staffName: string) {
		const faces = await this.prisma.staffFace.findMany({
			where: { staffName },
		});
		if (faces.length === 0)
			throw new NotFoundException(`Staf "${staffName}" tidak ditemukan`);

		// Hapus semua file fisik
		for (const face of faces) {
			try {
				fs.unlinkSync(face.photoPath);
			} catch {
				// Abaikan jika file sudah tidak ada
			}
		}

		await this.prisma.staffFace.deleteMany({ where: { staffName } });
		return { deleted: faces.length };
	}

	/** Serve foto wajah — return path absolut file */
	getPhotoPath(id: string) {
		return this.prisma.staffFace
			.findUnique({ where: { id }, select: { photoPath: true } })
			.then((r) => {
				if (!r) throw new NotFoundException("Data wajah tidak ditemukan");
				if (!fs.existsSync(r.photoPath)) {
					throw new NotFoundException("File foto tidak ditemukan");
				}
				return r.photoPath;
			});
	}

	// ─── Embeddings (dipanggil worker via internal endpoint) ──────────────────

	/** Ambil semua face entry yang belum punya embedding (untuk enrollment oleh worker). */
	async getPendingEmbeddings() {
		return this.prisma.staffFace.findMany({
			where: {
				// embedding kosong = belum diproses
				OR: [{ embedding: { equals: [] } }],
			},
			select: {
				id: true,
				staffName: true,
				photoPath: true,
			},
		});
	}

	/** Ambil semua face entry yang sudah punya embedding (untuk matching oleh worker). */
	async getAllEmbeddings() {
		const faces = await this.prisma.staffFace.findMany({
			where: {
				NOT: { embedding: { equals: [] } },
			},
			select: {
				id: true,
				staffName: true,
				embedding: true,
			},
		});
		return faces;
	}

	/** Update embedding setelah worker selesai extract. */
	async updateEmbedding(id: string, embedding: number[]) {
		return this.prisma.staffFace.update({
			where: { id },
			data: { embedding },
		});
	}

	// ─── System Settings ────────────────────────────────────────────────────

	async upsertSetting(dto: UpsertSettingDto) {
		return this.prisma.systemSetting.upsert({
			where: { key: dto.key },
			update: { value: dto.value },
			create: { key: dto.key, value: dto.value },
		});
	}

	async getSetting(key: string) {
		return this.prisma.systemSetting.findUnique({ where: { key } });
	}

	async getAllSettings() {
		return this.prisma.systemSetting.findMany({
			orderBy: { key: "asc" },
		});
	}
}
