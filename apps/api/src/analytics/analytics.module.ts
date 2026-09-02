import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { AnalyticsCleanupService } from "./analytics-cleanup.service";
import { AnalyticsReconcileService } from "./analytics-reconcile.service";
import { AnalyticsInternalController } from "./analytics-internal.controller";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";

@Module({
	imports: [ScheduleModule.forRoot()],
	controllers: [AnalyticsController, AnalyticsInternalController],
	providers: [
		AnalyticsService,
		AnalyticsCleanupService,
		AnalyticsReconcileService,
	],
	exports: [AnalyticsService],
})
export class AnalyticsModule {}
