import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { ShiftController } from "./shift.controller";
import { ShiftService } from "./shift.service";

@Module({
	imports: [DatabaseModule],
	controllers: [ShiftController],
	providers: [ShiftService],
	exports: [ShiftService],
})
export class ShiftModule {}
