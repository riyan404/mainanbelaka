import {
	CanActivate,
	ExecutionContext,
	Injectable,
	UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthService, type AdminSession } from "./auth.service";

export type AuthenticatedRequest = Request & {
	admin: AdminSession;
	cookies?: Record<string, string>;
};

@Injectable()
export class AuthGuard implements CanActivate {
	constructor(private readonly auth: AuthService) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
		const token = request.cookies?.cctv_session;
		if (!token) throw new UnauthorizedException("Sesi diperlukan");
		try {
			request.admin = await this.auth.verifyToken(token);
			return true;
		} catch {
			throw new UnauthorizedException("Sesi tidak valid");
		}
	}
}
