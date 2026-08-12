import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";

@Global()
@Module({
	imports: [
		JwtModule.registerAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				secret:
					config.get<string>("JWT_SECRET") ?? "development-only-change-me",
				signOptions: { expiresIn: "8h" },
			}),
		}),
	],
	controllers: [AuthController],
	providers: [AuthService, AuthGuard],
	exports: [AuthService, AuthGuard],
})
export class AuthModule {}
