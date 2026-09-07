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

/**
 * Registrasi webcam manual (tanpa Hikvision detect).
 * Stream sudah tersedia di MediaMTX via WHIP browser atau ffmpeg bridge.
 */
export class CreateWebcamDeviceDto {
	/** Nama tampilan PC kasir, mis. "PC Kasir 1" */
	@IsString()
	@MinLength(2)
	name!: string;

	/**
	 * Nama path di MediaMTX, mis. "webcam-kasir-1".
	 * Stream akan tersedia di rtsp://mediamtx:8554/<streamPath>
	 */
	@IsString()
	@MinLength(1)
	streamPath!: string;

	/** Nama lokasi kasir (opsional) */
	@IsOptional()
	@IsString()
	location?: string;
}

export class PrepareWebcamPathDto {
	/** Nama path MediaMTX (tanpa leading slash), mis. "webcam-kasir-1" */
	@IsString()
	@MinLength(1)
	streamPath!: string;
}

/**
 * Registrasi sumber RTSP langsung (tanpa Hikvision ISAPI).
 * Cocok untuk: screen capture, IP cam sederhana, encoder yang expose RTSP publik.
 * Contoh: rtsp://10.0.9.254:8554/screenlive
 */
export class CreateRtspDeviceDto {
	/** Nama tampilan, mis. "Screen Live" */
	@IsString()
	@MinLength(2)
	name!: string;

	/** URL RTSP lengkap, mis. "rtsp://10.0.9.254:8554/screenlive" */
	@IsString()
	@MinLength(7)
	rtspUrl!: string;

	/** Nama lokasi (opsional) */
	@IsOptional()
	@IsString()
	location?: string;
}
