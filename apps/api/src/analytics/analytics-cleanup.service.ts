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
}
