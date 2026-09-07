import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Post,
	Put,
	Query,
	UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import {
	CreateShiftDto,
	ShiftQueryDto,
	StaffReportQueryDto,
	UpdateShiftDto,
} from "./shift.dto";
import { ShiftService } from "./shift.service";

@Controller("shifts")
@UseGuards(AuthGuard)
export class ShiftController {
	constructor(private readonly shift: ShiftService) {}

	// ─── CRUD Shift ───────────────────────────────────────────────────────────

	@Post()
	create(@Body() dto: CreateShiftDto) {
		return this.shift.createShift(dto);
	}

	@Get()
	list(@Query() query: ShiftQueryDto) {
		return this.shift.listShifts(query);
	}

	@Get("staff-names")
	listStaffNames() {
		return this.shift.listStaffNames();
	}

	@Get("report")
	getReport(@Query() query: StaffReportQueryDto) {
		return this.shift.getStaffReport(query);
	}

	@Get(":id")
	getOne(@Param("id") id: string) {
		return this.shift.getShift(id);
	}

	@Put(":id")
	update(@Param("id") id: string, @Body() dto: UpdateShiftDto) {
		return this.shift.updateShift(id, dto);
	}

	@Delete(":id")
	remove(@Param("id") id: string) {
		return this.shift.deleteShift(id);
	}
}
