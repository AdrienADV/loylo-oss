import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Tests run inside workerd. Keep these settings in sync with wrangler.jsonc
// (its `main` entry is only resolvable through the TanStack Start Vite plugin).
export default defineConfig({
	resolve: { tsconfigPaths: true },
	plugins: [
		cloudflareTest({
			miniflare: {
				compatibilityDate: "2026-08-01",
				compatibilityFlags: ["nodejs_compat"],
			},
		}),
	],
});
