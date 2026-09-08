import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../database/prisma.service";

/**
 * Membersihkan DwellEvent lama berdasarkan retensi yang dikonfigurasi.
 * Berjalan tiap jam via @nestjs/schedule cron.
 */
@Injectable()
export class AnalyticsCleanupService {
	private readonly logger = new Logger(AnalyticsCleanupService.name);

	constructor(private readonly prisma: PrismaService) {}

	@Cron(CronExpression.EVERY_HOUR)
	async cleanupOldEvents(): Promise<void> {
		const retentionDays = Number(process.env.ANALYTICS_RETENTION_DAYS ?? 30);
		const cutoff = new Date();
		cutoff.setDate(cutoff.getDate() - retentionDays);

		try {
			const result = await this.prisma.dwellEvent.deleteMany({
				where: { enteredAt: { lt: cutoff } },
			});
			if (result.count > 0) {
				this.logger.log(
					`Retensi: ${result.count} DwellEvent lama dihapus (>${retentionDays} hari)`,
				);
			}
		} catch (error) {
			this.logger.error("Retensi DwellEvent gagal", error);
		}
	}

	/**
	 * Hapus DwellEvent UNKNOWN (wajah tidak dikenal) yang sudah lewat masa retensi.
	 * Default 2 hari — configurable via SystemSetting "unknownEventRetentionDays".
	 */
	@Cron(CronExpression.EVERY_HOUR)
	async cleanupUnknownEvents(): Promise<void> {
		try {
			// Baca setting dari DB, fallback ke 2 hari
			const setting = await this.prisma.systemSetting.findUnique({
				where: { key: "unknownEventRetentionDays" },
			});
			const retentionDays = setting ? Number.parseInt(setting.value, 10) : 2;

			const cutoff = new Date();
			cutoff.setDate(cutoff.getDate() - retentionDays);

			const result = await this.prisma.dwellEvent.deleteMany({
				where: {
					staffName: null, // UNKNOWN — wajah tidak dikenal
					enteredAt: { lt: cutoff },
				},
			});
			if (result.count > 0) {
				this.logger.log(
					`Cleanup: ${result.count} event UNKNOWN dihapus (>${retentionDays} hari)`,
				);
			}
		} catch (error) {
			this.logger.error("Cleanup event UNKNOWN gagal", error);
		}
	}
}
