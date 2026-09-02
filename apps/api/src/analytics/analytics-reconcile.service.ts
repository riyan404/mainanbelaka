import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { AnalyticsService } from "./analytics.service";

/**
 * Auto-repair path MediaMTX untuk kamera yang analitiknya aktif.
 * Berjalan tiap menit; memastikan path selalu punya source RTSP dengan kredensial.
 */
@Injectable()
export class AnalyticsReconcileService {
	private readonly logger = new Logger(AnalyticsReconcileService.name);

	constructor(private readonly analytics: AnalyticsService) {}

	@Cron(CronExpression.EVERY_MINUTE)
	async reconcile(): Promise<void> {
		try {
			const { repaired } = await this.analytics.reconcileMediaMtxPaths();
			if (repaired > 0) {
				this.logger.log(`MediaMTX paths dire-ensure: ${repaired} kamera`);
			}
		} catch (error) {
			this.logger.error("Reconcile MediaMTX paths gagal", error);
		}
	}
}
