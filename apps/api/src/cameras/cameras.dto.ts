import { IsArray, IsBoolean, IsOptional, IsString } from "class-validator";

export class UpdateCameraDto {
	@IsOptional() @IsString() name?: string;
	@IsOptional() @IsString() location?: string;
	@IsOptional() @IsArray() @IsString({ each: true }) groupIds?: string[];
}

export class SetCameraEnabledDto {
	@IsBoolean() enabled!: boolean;
}

export class ListCamerasQueryDto {
	@IsOptional() @IsString() search?: string;
	@IsOptional() @IsBoolean() enabled?: boolean;
	@IsOptional() page?: number;
	@IsOptional() pageSize?: number;
}
