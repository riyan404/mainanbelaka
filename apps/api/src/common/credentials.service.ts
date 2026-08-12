import { Injectable } from "@nestjs/common";
import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";

@Injectable()
export class CredentialsService {
	private readonly key = createHash("sha256")
		.update(process.env.CREDENTIALS_KEY ?? "development-only-change-me")
		.digest();

	encrypt(value: string): string {
		const iv = randomBytes(12);
		const cipher = createCipheriv("aes-256-gcm", this.key, iv);
		const encrypted = Buffer.concat([
			cipher.update(value, "utf8"),
			cipher.final(),
		]);
		const tag = cipher.getAuthTag();
		return [iv, tag, encrypted]
			.map((part) => part.toString("base64url"))
			.join(".");
	}

	decrypt(value: string): string {
		const [ivValue, tagValue, dataValue] = value.split(".");
		if (!ivValue || !tagValue || !dataValue)
			throw new Error("Data kredensial rusak");
		const decipher = createDecipheriv(
			"aes-256-gcm",
			this.key,
			Buffer.from(ivValue, "base64url"),
		);
		decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
		return Buffer.concat([
			decipher.update(Buffer.from(dataValue, "base64url")),
			decipher.final(),
		]).toString("utf8");
	}
}
