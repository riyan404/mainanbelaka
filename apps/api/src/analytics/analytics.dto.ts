import { Type } from "class-transformer";
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsBoolean,
	IsDateString,
	IsIn,
	IsInt,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	Max,
	Min,
	MinLength,
	ValidateNested,
} from "class-validator";

// ─── Polygon point ──────────────────────────────────────────────

export class PolygonPointDto {
	@IsNumber()
	@Min(0)
	@Max(1)
	x!: number;

	@IsNumber()
	@Min(0)
	@Max(1)
	y!: number;
}

// ─── Zone DTOs ──────────────────────────────────────────────────

export class CreateZoneDto {
	@IsString()
	@MinLength(1)
	cameraChannelId!: string;

	@IsString()
	@IsNotEmpty()
	name!: string;

	@IsArray()
	@ArrayMinSize(3)
	@ValidateNested({ each: true })
	@Type(() => PolygonPointDto)
	polygon!: PolygonPointDto[];

	@IsBoolean()
	@IsOptional()
	trackPosture?: boolean;
}

export class UpdateZoneDto {
	@IsString()
	@IsNotEmpty()
	@IsOptional()
	name?: string;

	@IsArray()
	@ArrayMinSize(3)
	@ValidateNested({ each: true })
	@Type(() => PolygonPointDto)
	@IsOptional()
	polygon?: PolygonPointDto[];

	@IsBoolean()
	@IsOptional()
	trackPosture?: boolean;

	@IsBoolean()
	@IsOptional()
	enabled?: boolean;
}

// ─── Event query DTOs ───────────────────────────────────────────

export class EventQueryDto {
	@IsString()
	@MinLength(1)
	@IsOptional()
	zoneId?: string;

	@IsString()
	@MinLength(1)
	@IsOptional()
	cameraId?: string;

	@IsDateString()
	@IsOptional()
	from?: string;

	@IsDateString()
	@IsOptional()
	to?: string;

	@IsIn(["SITTING", "STANDING", "UNKNOWN"])
	@IsOptional()
	posture?: string;

	@IsInt()
	@Min(1)
	@IsOptional()
	@Type(() => Number)
	page?: number;
}

export class SummaryQueryDto {
	@IsString()
	@MinLength(1)
	@IsOptional()
	zoneId?: string;

	@IsString()
	@MinLength(1)
	@IsOptional()
	cameraId?: string;

	@IsDateString()
	@IsOptional()
	from?: string;

	@IsDateString()
	@IsOptional()
	to?: string;
}

// ─── Internal worker DTOs ───────────────────────────────────────

export class DwellEventInputDto {
	@IsString()
	@MinLength(1)
	zoneId!: string;

	@IsString()
	@IsNotEmpty()
	trackRef!: string;

	@IsIn(["SITTING", "STANDING", "UNKNOWN"])
	@IsOptional()
	posture?: string;

	/** Nama staf teridentifikasi oleh face recognition (null = UNKNOWN/tidak dikenal) */
	@IsString()
	@IsOptional()
	staffName?: string;

	@IsDateString()
	enteredAt!: string;

	@IsDateString()
	@IsOptional()
	exitedAt?: string;

	@IsInt()
	@Min(0)
	@IsOptional()
	durationSeconds?: number;
}

export class BatchEventsDto {
	@IsString()
	@MinLength(1)
	cameraChannelId!: string;

	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => DwellEventInputDto)
	events!: DwellEventInputDto[];
}

export class WorkerStatusUpdateDto {
	@IsString()
	@MinLength(1)
	cameraChannelId!: string;

	@IsIn(["IDLE", "RUNNING", "ERROR"])
	workerStatus!: string;

	@IsString()
	@IsOptional()
	lastErrorMessage?: string;
}

export class LiveTrackDto {
	@IsString()
	@IsNotEmpty()
	trackRef!: string;

	@IsArray()
	@ArrayMinSize(4)
	@ArrayMaxSize(4)
	@IsNumber({}, { each: true })
	bbox!: number[];

	@IsIn(["SITTING", "STANDING", "UNKNOWN"])
	@IsOptional()
	posture?: "SITTING" | "STANDING" | "UNKNOWN" | null;

	@IsString()
	@MinLength(1)
	@IsOptional()
	zoneId?: string | null;

	@IsInt()
	@Min(0)
	@IsOptional()
	durationSeconds?: number;

	@IsString()
	@IsOptional()
	staffName?: string | null;
}

export class LiveStateDto {
	@IsString()
	@MinLength(1)
	cameraChannelId!: string;

	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => LiveTrackDto)
	tracks!: LiveTrackDto[];
}

export class EnableAnalyticsDto {
	/** Mode analitik: POSE (tubuh/postur), FACE (wajah/kehadiran), atau FACE_ID (pengenalan wajah). */
	@IsIn(["POSE", "FACE", "FACE_ID"])
	@IsOptional()
	mode?: "POSE" | "FACE" | "FACE_ID";
}
