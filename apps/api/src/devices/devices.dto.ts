import { DeviceType } from "@prisma/client";
import {
	IsEnum,
	IsInt,
	IsOptional,
	IsString,
	Max,
	Min,
	MinLength,
} from "class-validator";

export class DeviceConnectionDto {
	@IsString() @MinLength(2) name!: string;
	@IsEnum(DeviceType) type!: DeviceType;
	@IsString() host!: string;
	@IsInt() @Min(1) @Max(65535) httpPort = 80;
	@IsInt() @Min(1) @Max(65535) rtspPort = 554;
	@IsString() username!: string;
	@IsString() @MinLength(1) password!: string;
}

export class CreateDeviceDto extends DeviceConnectionDto {
	@IsString() detectionToken!: string;
}

export class UpdateDeviceDto {
	@IsOptional() @IsString() @MinLength(2) name?: string;
}
