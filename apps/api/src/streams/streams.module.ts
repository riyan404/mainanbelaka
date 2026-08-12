import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { HikvisionModule } from "../hikvision/hikvision.module";
import { StreamsController } from "./streams.controller";
import { StreamsService } from "./streams.service";

@Module({
	imports: [CommonModule, HikvisionModule],
	controllers: [StreamsController],
	providers: [StreamsService],
})
export class StreamsModule {}
