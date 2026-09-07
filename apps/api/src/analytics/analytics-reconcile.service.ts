import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { AnalyticsService } from "./analytics.service";

/**
 * Auto-repair path MediaMTX untuk kamera yang analitiknya aktif.
 * - Saat startup (OnModuleInit): reconcile semua path langsung
 * - Tiap menit (Cron): ensure path tidak hilang setelah MediaMTX restart
 *
 * NVR: re-ensure RTSP source path
 * Webcam: re-ensure publisher path (sourceOnDemand: false)
 */
@Injectable()
export class AnalyticsReconcileService implements OnModuleInit {
	private readonly logger = new Logger(AnalyticsReconcileService.name);

	constructor(private readonly analytics: AnalyticsService) {}

	/** Reconcile segera saat API start — pastikan semua path sudah terdaftar di MediaMTX. */
	async onModuleInit(): Promise<void> {
		// Delay 5 detik supaya MediaMTX sudah siap menerima request
		setTimeout(() => void this.reconcile(), 5000);
	}

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
