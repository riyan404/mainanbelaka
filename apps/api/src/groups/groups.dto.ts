import { IsArray, IsOptional, IsString, MinLength } from "class-validator";

export class CreateGroupDto {
	@IsString() @MinLength(2) name!: string;
	@IsOptional() @IsString() description?: string;
}

export class SetGroupCamerasDto {
	@IsArray() @IsString({ each: true }) cameraIds!: string[];
}
