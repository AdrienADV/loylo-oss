import { env } from "cloudflare:workers";
import { getRequest } from "@tanstack/react-start/server";

/** The visitor's IP: Cloudflare sets `cf-connecting-ip` on every request. */
export function getClientIp(): string | undefined {
	const headers = getRequest().headers;
	return (
		headers.get("cf-connecting-ip") ??
		headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
		undefined
	);
}

/** Rate limiter bindings, configured in wrangler.jsonc. */
export type RateLimiterName = "AUTH_RATE_LIMITER" | "ENROLLMENT_RATE_LIMITER";

/**
 * Counts one `action` from the visitor's IP. Returns `false` once the
 * limiter's quota for this IP and action is used up.
 */
export async function consumeRateLimit(
	limiter: RateLimiterName,
	action: string,
): Promise<boolean> {
	const { success } = await env[limiter].limit({
		key: `${action}:${getClientIp() ?? "unknown"}`,
	});
	return success;
}
