import {
	Injectable,
	OnModuleInit,
	UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { hash, verify } from "argon2";
import { PrismaService } from "../database/prisma.service";

export interface AdminSession {
	id: string;
	username: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
	constructor(
		private readonly prisma: PrismaService,
		private readonly jwt: JwtService,
	) {}

	async onModuleInit(): Promise<void> {
		if ((await this.prisma.admin.count()) > 0) return;
		const username = process.env.ADMIN_USERNAME;
		const password = process.env.ADMIN_PASSWORD;
		if (!username || !password || password.length < 8) {
			throw new Error(
				"ADMIN_USERNAME dan ADMIN_PASSWORD minimal 8 karakter wajib diatur",
			);
		}
		await this.prisma.admin.create({
			data: { username, passwordHash: await hash(password) },
		});
	}

	async login(
		username: string,
		password: string,
	): Promise<{ token: string; admin: AdminSession }> {
		const admin = await this.prisma.admin.findUnique({ where: { username } });
		if (!admin || !(await verify(admin.passwordHash, password))) {
			throw new UnauthorizedException("Username atau password salah");
		}
		await this.prisma.admin.update({
			where: { id: admin.id },
			data: { lastLoginAt: new Date() },
		});
		const session = { id: admin.id, username: admin.username };
		return { token: await this.jwt.signAsync(session), admin: session };
	}

	verifyToken(token: string): Promise<AdminSession> {
		return this.jwt.verifyAsync<AdminSession>(token);
	}

	async changePassword(
		id: string,
		currentPassword: string,
		newPassword: string,
	): Promise<void> {
		const admin = await this.prisma.admin.findUniqueOrThrow({ where: { id } });
		if (!(await verify(admin.passwordHash, currentPassword))) {
			throw new UnauthorizedException("Password saat ini salah");
		}
		await this.prisma.admin.update({
			where: { id },
			data: { passwordHash: await hash(newPassword) },
		});
	}
}
