import {
	CanActivate,
	ExecutionContext,
	Injectable,
	UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

/**
 * Guard untuk endpoint internal worker→API.
 * Verifikasi shared secret via header X-Internal-Token.
 * Tidak bergantung pada sesi admin — hanya worker yang boleh akses.
 */
@Injectable()
export class AnalyticsInternalGuard implements CanActivate {
	canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest<Request>();
		const token = request.headers["x-internal-token"];
		const expected = process.env.ANALYTICS_WORKER_TOKEN;

		if (!expected) {
			throw new UnauthorizedException(
				"ANALYTICS_WORKER_TOKEN belum dikonfigurasi",
			);
		}

		if (token !== expected) {
			throw new UnauthorizedException("Token internal tidak valid");
		}

		return true;
	}
}
