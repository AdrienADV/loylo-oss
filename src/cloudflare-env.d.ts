// Bindings declared in wrangler.jsonc, read through `import { env } from "cloudflare:workers"`.
declare module "cloudflare:workers" {
	interface RateLimit {
		limit(options: { key: string }): Promise<{ success: boolean }>;
	}

	export const env: {
		AUTH_RATE_LIMITER: RateLimit;
		ENROLLMENT_RATE_LIMITER: RateLimit;
	};
}
