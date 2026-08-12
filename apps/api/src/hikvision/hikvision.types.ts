export interface HikvisionConnection {
	host: string;
	httpPort: number;
	rtspPort: number;
	username: string;
	password: string;
}

export interface HikvisionDeviceInfo {
	manufacturer?: string;
	model?: string;
	serialNumber?: string;
	firmwareVersion?: string;
}

export interface DetectedChannel {
	channelNumber: number;
	sourceName?: string;
}

export interface StreamProbe {
	available: boolean;
	codec?: string;
	resolution?: string;
	fps?: number;
	error?: string;
}

export interface DetectedCamera extends DetectedChannel {
	mainStreamPath: string;
	subStreamPath: string;
	main: StreamProbe;
	sub: StreamProbe;
}

export interface DetectionResult {
	device: HikvisionDeviceInfo;
	channels: DetectedCamera[];
}
