import type { NextConfig } from "next";
import path from "node:path";

const allowedDevOrigins = (
	process.env.NEXT_ALLOWED_DEV_ORIGINS ??
	"192.168.1.144,10.0.92.61,100.93.151.47"
)
	.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);

const nextConfig: NextConfig = {
	allowedDevOrigins,
	output: "standalone",
	outputFileTracingRoot: path.join(process.cwd(), "../.."),
	poweredByHeader: false,
};

export default nextConfig;
