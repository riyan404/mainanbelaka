import { StreamsService } from "./streams.service";

describe("StreamsService", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = {
			...originalEnv,
			MEDIAMTX_API_URL: "http://127.0.0.1:9917",
			MEDIAMTX_PUBLIC_WEBRTC_URL: "http://localhost:8917",
		};
	});

	afterEach(() => {
		process.env = originalEnv;
		jest.restoreAllMocks();
	});

	it("forces RTSP over TCP when registering a Hikvision source", async () => {
		const prisma = {
			cameraChannel: {
				findUnique: jest.fn().mockResolvedValue({
					id: "camera-1",
					enabled: true,
					availability: "AVAILABLE",
					mainStreamPath: "/Streaming/Channels/101",
					subStreamPath: "/Streaming/Channels/102",
					device: {
						host: "172.16.18.5",
						httpPort: 80,
						rtspPort: 554,
						usernameEncrypted: "user",
						passwordEncrypted: "pass",
						archivedAt: null,
					},
				}),
			},
		};
		const credentials = { decrypt: jest.fn((value: string) => value) };
		const probe = {
			buildUrl: jest.fn().mockReturnValue("rtsp://redacted/source"),
		};
		const fetchMock = jest
			.spyOn(global, "fetch")
			.mockResolvedValue(new Response(null, { status: 200 }));
		const service = new StreamsService(
			prisma as never,
			credentials as never,
			probe as never,
		);

		await service.createSession("camera-1", "sub");

		expect(fetchMock).toHaveBeenCalledWith(
			"http://127.0.0.1:9917/v3/config/paths/add/camera-camera-1-sub",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({
					source: "rtsp://redacted/source",
					rtspTransport: "tcp",
					sourceOnDemand: true,
				}),
			}),
		);
	});
});
