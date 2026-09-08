import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Post,
	Put,
	Query,
	Res,
	UploadedFile,
	UseGuards,
	UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { AuthGuard } from "../auth/auth.guard";
import { StaffQueryDto, UpsertSettingDto } from "./staff.dto";
import { StaffService } from "./staff.service";

@Controller("staff")
@UseGuards(AuthGuard)
export class StaffController {
	constructor(private readonly staff: StaffService) {}

	// ─── Face Enrollment ──────────────────────────────────────────────────────

	@Post("faces")
	@UseInterceptors(
		FileInterceptor("photo", {
			limits: { fileSize: 5 * 1024 * 1024 }, // max 5MB
		}),
	)
	uploadFace(
		@Body("staffName") staffName: string,
		@UploadedFile() file: Express.Multer.File,
	) {
		return this.staff.createFace({ staffName }, file);
	}

	@Get("faces")
	listFaces(@Query() query: StaffQueryDto) {
		return this.staff.listFaces(query);
	}

	@Get("faces/names")
	listEnrolledNames() {
		return this.staff.listEnrolledNames();
	}

	@Get("faces/:id/photo")
	async servePhoto(@Param("id") id: string, @Res() res: Response) {
		const photoPath = await this.staff.getPhotoPath(id);
		return res.sendFile(photoPath);
	}

	@Delete("faces/by-name/:staffName")
	deleteStaffSlot(@Param("staffName") staffName: string) {
		return this.staff.deleteStaffSlot(staffName);
	}

	@Delete("faces/:id")
	deleteFace(@Param("id") id: string) {
		return this.staff.deleteFace(id);
	}

	// ─── System Settings ────────────────────────────────────────────────────

	@Get("settings")
	getSettings() {
		return this.staff.getAllSettings();
	}

	@Put("settings")
	upsertSetting(@Body() dto: UpsertSettingDto) {
		return this.staff.upsertSetting(dto);
	}

	@Get("settings/:key")
	getSetting(@Param("key") key: string) {
		return this.staff.getSetting(key);
	}
}
