import { RtspProbeService } from "./rtsp-probe.service";

it("builds credentialed RTSP URL safely", () => {
	const url = new RtspProbeService().buildUrl(
		{
			host: "192.168.1.20",
			httpPort: 80,
			rtspPort: 554,
			username: "admin",
			password: "p@ss",
		},
		"/Streaming/Channels/101",
	);
	expect(url).toBe(
		"rtsp://admin:p%40ss@192.168.1.20:554/Streaming/Channels/101",
	);
});
