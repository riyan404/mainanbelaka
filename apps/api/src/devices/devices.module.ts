import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { HikvisionModule } from "../hikvision/hikvision.module";
import { DevicesController } from "./devices.controller";
import { DevicesService } from "./devices.service";

@Module({
	imports: [CommonModule, HikvisionModule],
	controllers: [DevicesController],
	providers: [DevicesService],
})
export class DevicesModule {}
