import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
	const app = await NestFactory.create(AppModule);
	app.setGlobalPrefix("api");
	app.use(cookieParser());
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			transform: true,
			forbidNonWhitelisted: true,
		}),
	);
	app.enableCors({
		origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
		credentials: true,
	});
	await app.listen(Number(process.env.API_PORT ?? 4000), "0.0.0.0");
}

void bootstrap();
