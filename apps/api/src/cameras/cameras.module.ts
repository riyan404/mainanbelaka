import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { HikvisionModule } from "../hikvision/hikvision.module";
import { CamerasController } from "./cameras.controller";
import { CamerasService } from "./cameras.service";

@Module({
	imports: [CommonModule, HikvisionModule],
	controllers: [CamerasController],
	providers: [CamerasService],
})
export class CamerasModule {}
