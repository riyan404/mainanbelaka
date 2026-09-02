import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AnalyticsModule } from "./analytics/analytics.module";
import { AuthModule } from "./auth/auth.module";
import { CamerasModule } from "./cameras/cameras.module";
import { CommonModule } from "./common/common.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { DatabaseModule } from "./database/database.module";
import { DevicesModule } from "./devices/devices.module";
import { GroupsModule } from "./groups/groups.module";
import { HealthModule } from "./health/health.module";
import { HikvisionModule } from "./hikvision/hikvision.module";
import { StreamsModule } from "./streams/streams.module";

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true }),
		DatabaseModule,
		CommonModule,
		AuthModule,
		HealthModule,
		HikvisionModule,
		DevicesModule,
		CamerasModule,
		GroupsModule,
		DashboardModule,
		StreamsModule,
		AnalyticsModule,
	],
})
export class AppModule {}
