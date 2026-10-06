import { importPKCS8, SignJWT } from "jose";

/**
 * Tells Wallet that passes changed, through the Apple Push Notification
 * service. Each device then asks the PassKit Web Service which of its passes
 * were updated and downloads them again.
 *
 * APNs only speaks HTTP/2: deployed Workers reach it through `fetch`, but the
 * local workerd runtime (`vite dev`) cannot, so pushes fail in development.
 */

/** Wallet pass updates are only delivered by the production environment. */
const APNS_ORIGIN = "https://api.push.apple.com";

/**
 * Apple rejects provider tokens older than one hour, and refreshes made more
 * than once every 20 minutes.
 */
const PROVIDER_TOKEN_LIFETIME_MS = 50 * 60 * 1000;

/** Workers keep at most 6 connections open at once per request. */
const MAX_CONCURRENT_REQUESTS = 6;

export interface ApnsCredentials {
	teamId: string;
	/** ID of the APNs key (Apple Developer account, Keys). */
	keyId: string;
	/** Content of the `.p8` key (PEM, PKCS#8). */
	privateKey: string;
}

export type PassPushResult = { pushToken: string } & (
	| { status: "sent" }
	/** The device no longer accepts pushes: delete its registration. */
	| { status: "unregistered" }
	| { status: "failed"; reason: string }
);

interface SendPassUpdatePushesParams {
	pushTokens: string[];
	passTypeId: string;
	credentials: ApnsCredentials;
}

/** Reused across requests served by the same isolate. */
const providerTokens = new Map<string, { token: string; issuedAt: number }>();

async function getProviderToken(credentials: ApnsCredentials): Promise<string> {
	const cacheKey = `${credentials.teamId}.${credentials.keyId}`;
	const cached = providerTokens.get(cacheKey);
	const now = Date.now();
	if (cached && now - cached.issuedAt < PROVIDER_TOKEN_LIFETIME_MS) {
		return cached.token;
	}

	const key = await importPKCS8(credentials.privateKey, "ES256");
	const token = await new SignJWT({})
		.setProtectedHeader({ alg: "ES256", kid: credentials.keyId })
		.setIssuer(credentials.teamId)
		.setIssuedAt(Math.floor(now / 1000))
		.sign(key);
	providerTokens.set(cacheKey, { token, issuedAt: now });
	return token;
}

async function readErrorReason(response: Response): Promise<string> {
	try {
		const body: { reason?: unknown } = await response.json();
		return typeof body.reason === "string" ? body.reason : "Unknown";
	} catch {
		return "Unknown";
	}
}

async function sendPassUpdatePush(
	pushToken: string,
	passTypeId: string,
	providerToken: string,
): Promise<PassPushResult> {
	try {
		const response = await fetch(
			`${APNS_ORIGIN}/3/device/${encodeURIComponent(pushToken)}`,
			{
				method: "POST",
				headers: {
					authorization: `bearer ${providerToken}`,
					"apns-topic": passTypeId,
					"apns-push-type": "background",
					// Background pushes must use the low priority.
					"apns-priority": "5",
					"content-type": "application/json",
				},
				// Wallet ignores the payload: an empty dictionary is expected.
				body: "{}",
			},
		);
		if (response.ok) {
			return { pushToken, status: "sent" };
		}

		const reason = await readErrorReason(response);
		if (response.status === 410 || reason === "BadDeviceToken") {
			return { pushToken, status: "unregistered" };
		}
		return {
			pushToken,
			status: "failed",
			reason: `${response.status} ${reason}`,
		};
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return { pushToken, status: "failed", reason };
	}
}

async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	run: (item: T) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	const workers = Array.from(
		{ length: Math.min(limit, items.length) },
		async () => {
			while (next < items.length) {
				const index = next++;
				results[index] = await run(items[index]);
			}
		},
	);
	await Promise.all(workers);
	return results;
}

/**
 * Sends one "pass updated" push per device. Never throws for a single device:
 * each result says whether the push was sent, the device is gone, or it failed.
 */
export async function sendPassUpdatePushes({
	pushTokens,
	passTypeId,
	credentials,
}: SendPassUpdatePushesParams): Promise<PassPushResult[]> {
	const uniqueTokens = [...new Set(pushTokens)];
	if (uniqueTokens.length === 0) {
		return [];
	}

	const providerToken = await getProviderToken(credentials);
	const results = await mapWithConcurrency(
		uniqueTokens,
		MAX_CONCURRENT_REQUESTS,
		(pushToken) => sendPassUpdatePush(pushToken, passTypeId, providerToken),
	);

	// 403 means the provider token was refused: sign a new one next time.
	if (
		results.some(
			(result) => result.status === "failed" && result.reason.startsWith("403"),
		)
	) {
		providerTokens.delete(`${credentials.teamId}.${credentials.keyId}`);
	}
	return results;
}
