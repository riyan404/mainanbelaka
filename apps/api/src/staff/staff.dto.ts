import { IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator";

export class CreateStaffFaceDto {
	@IsString()
	@MinLength(1)
	staffName!: string;
	// File di-upload via multipart, bukan di body JSON
}

export class UpdateStaffFaceDto {
	@IsOptional()
	@IsString()
	@MinLength(1)
	staffName?: string;
}

export class StaffQueryDto {
	@IsOptional()
	@IsString()
	staffName?: string;
}

export class UpsertSettingDto {
	@IsString()
	@IsNotEmpty()
	key!: string;

	@IsString()
	@IsNotEmpty()
	value!: string;
}
