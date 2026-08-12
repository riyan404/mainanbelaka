import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
	@Get()
	check(): { status: "ok"; service: "cctv-api" } {
		return { status: "ok", service: "cctv-api" };
	}
}
