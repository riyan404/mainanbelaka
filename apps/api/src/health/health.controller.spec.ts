import { HealthController } from "./health.controller";

describe("HealthController", () => {
	it("returns healthy status", () => {
		expect(new HealthController().check()).toEqual({
			status: "ok",
			service: "cctv-api",
		});
	});
});
