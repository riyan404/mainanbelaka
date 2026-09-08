import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { AnalyticsCleanupService } from "./analytics-cleanup.service";
import { AnalyticsReconcileService } from "./analytics-reconcile.service";
import { AnalyticsInternalController } from "./analytics-internal.controller";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";
import { StaffModule } from "../staff/staff.module";

@Module({
	imports: [ScheduleModule.forRoot(), StaffModule],
	controllers: [AnalyticsController, AnalyticsInternalController],
	providers: [
		AnalyticsService,
		AnalyticsCleanupService,
		AnalyticsReconcileService,
	],
	exports: [AnalyticsService],
})
export class AnalyticsModule {}
