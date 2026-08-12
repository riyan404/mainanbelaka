import { CamerasService } from "./cameras.service";

describe("CamerasService", () => {
	it("adds an ungrouped camera to the default group when enabled", async () => {
		const camera = {
			id: "camera-1",
			availability: "AVAILABLE",
			mainStreamPath: "/Streaming/Channels/501",
			subStreamPath: "/Streaming/Channels/502",
			device: {
				host: "172.16.18.5",
				httpPort: 80,
				rtspPort: 554,
				usernameEncrypted: "user",
				passwordEncrypted: "pass",
				archivedAt: null,
			},
		};
		const prisma = {
			cameraChannel: {
				findUnique: jest.fn().mockResolvedValue(camera),
				update: jest.fn().mockResolvedValue({ ...camera, enabled: true }),
			},
			cameraGroup: {
				count: jest.fn().mockResolvedValue(0),
				upsert: jest.fn().mockResolvedValue({}),
			},
			group: {
				findFirst: jest.fn().mockResolvedValue({ id: "group-default" }),
			},
		};
		const credentials = { decrypt: jest.fn((value: string) => value) };
		const probe = {
			probe: jest.fn().mockResolvedValue({
				available: true,
				codec: "hevc",
				resolution: "640x360",
				fps: 20,
			}),
		};
		const service = new CamerasService(
			prisma as never,
			credentials as never,
			probe as never,
		);

		await service.setEnabled("camera-1", true);

		expect(prisma.cameraGroup.upsert).toHaveBeenCalledWith({
			where: {
				cameraChannelId_groupId: {
					cameraChannelId: "camera-1",
					groupId: "group-default",
				},
			},
			create: { cameraChannelId: "camera-1", groupId: "group-default" },
			update: {},
		});
	});
});
