import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
	plugins: [react()],
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./vitest.setup.ts"],
	},
	resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
