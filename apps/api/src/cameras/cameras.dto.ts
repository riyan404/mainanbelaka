import { IsArray, IsBoolean, IsOptional, IsString } from "class-validator";

export class UpdateCameraDto {
	@IsOptional() @IsString() name?: string;
	@IsOptional() @IsString() location?: string;
	@IsOptional() @IsArray() @IsString({ each: true }) groupIds?: string[];
}

export class SetCameraEnabledDto {
	@IsBoolean() enabled!: boolean;
}
