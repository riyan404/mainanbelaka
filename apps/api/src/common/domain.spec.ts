import {
	buildHikvisionStreamId,
	buildHikvisionStreamPath,
	isRequiredVideoCodec,
	sanitizeHost,
} from "./domain";

describe("Hikvision stream mapping", () => {
	it("maps channel and quality to Hikvision stream IDs", () => {
		expect(buildHikvisionStreamId(1, "main")).toBe(101);
		expect(buildHikvisionStreamId(1, "sub")).toBe(102);
		expect(buildHikvisionStreamId(32, "main")).toBe(3201);
	});

	it("builds canonical stream paths", () => {
		expect(buildHikvisionStreamPath(8, "sub")).toBe("/Streaming/Channels/802");
	});

	it("accepts HEVC only", () => {
		expect(isRequiredVideoCodec("hevc")).toBe(true);
		expect(isRequiredVideoCodec("HEVC")).toBe(true);
		expect(isRequiredVideoCodec("h264")).toBe(false);
	});

	it("rejects invalid channels and hosts", () => {
		expect(() => buildHikvisionStreamId(0, "main")).toThrow(RangeError);
		expect(() => sanitizeHost("127.0.0.1; rm -rf /")).toThrow(
			"IP/hostname tidak valid",
		);
	});
});
