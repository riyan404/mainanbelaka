import {
	IsDateString,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	Max,
	Min,
	MinLength,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateShiftDto {
	@IsString()
	@MinLength(1)
	staffName!: string;

	@IsString()
	@MinLength(1)
	cameraChannelId!: string;

	/** Zona spesifik (opsional — null/kosong = semua zona di kamera) */
	@IsOptional()
	@IsString()
	zoneId?: string;

	/** ISO 8601 dengan timezone, mis. "2026-09-05T08:00:00+07:00" */
	@IsDateString()
	startTime!: string;

	@IsDateString()
	endTime!: string;

	@IsOptional()
	@IsString()
	notes?: string;
}

export class UpdateShiftDto {
	@IsOptional()
	@IsString()
	@MinLength(1)
	staffName?: string;

	@IsOptional()
	@IsString()
	@MinLength(1)
	cameraChannelId?: string;

	/** Zona spesifik — kirim null eksplisit untuk reset ke "semua zona" */
	@IsOptional()
	@IsString()
	zoneId?: string | null;

	@IsOptional()
	@IsDateString()
	startTime?: string;

	@IsOptional()
	@IsDateString()
	endTime?: string;

	@IsOptional()
	@IsString()
	notes?: string;
}

export class ShiftQueryDto {
	/** Filter berdasarkan nama kasir (partial, case-insensitive) */
	@IsOptional()
	@IsString()
	staffName?: string;

	/** Filter berdasarkan kamera */
	@IsOptional()
	@IsString()
	cameraChannelId?: string;

	/** Filter berdasarkan zona spesifik */
	@IsOptional()
	@IsString()
	zoneId?: string;

	/** Tanggal mulai range (ISO date) */
	@IsOptional()
	@IsDateString()
	from?: string;

	/** Tanggal akhir range (ISO date) */
	@IsOptional()
	@IsDateString()
	to?: string;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	page?: number;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	pageSize?: number;
}

export class StaffReportQueryDto {
	/** Nama kasir spesifik (opsional — kosong = semua staf) */
	@IsOptional()
	@IsString()
	staffName?: string;

	/** Kamera PC kasir */
	@IsOptional()
	@IsString()
	cameraChannelId?: string;

	/** Zona spesifik (opsional — kosong = semua zona di kamera) */
	@IsOptional()
	@IsString()
	zoneId?: string;

	/** Tanggal mulai laporan — ISO date "YYYY-MM-DD" */
	@IsString()
	@IsNotEmpty()
	from!: string;

	/** Tanggal akhir laporan — ISO date "YYYY-MM-DD" */
	@IsString()
	@IsNotEmpty()
	to!: string;
}
