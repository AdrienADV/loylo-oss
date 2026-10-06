import { importPKCS8, SignJWT } from "jose";
import { z } from "zod";

import {
	buildLoyaltyPoints,
	type GoogleLoyaltyClass,
	type GoogleLoyaltyObject,
} from "#/lib/wallet/google/objects";

/** Google Wallet REST API, authenticated with a service account. */

const API_URL = "https://walletobjects.googleapis.com/walletobjects/v1";
const SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer";
const SAVE_URL = "https://pay.google.com/gp/v/save";

/** Refresh access tokens one minute before Google expires them. */
const ACCESS_TOKEN_MARGIN_MS = 60_000;

export interface GoogleServiceAccount {
	clientEmail: string;
	/** PEM, PKCS#8. */
	privateKey: string;
	tokenUri: string;
}

export class GoogleWalletApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(`Google Wallet API error ${status}: ${message}`);
		this.name = "GoogleWalletApiError";
	}
}

const accessTokenResponseSchema = z.object({
	access_token: z.string().min(1),
	expires_in: z.number().positive(),
});

const errorResponseSchema = z.object({
	error: z.object({ message: z.string() }),
});

/** Reused across requests served by the same isolate. */
const accessTokens = new Map<string, { token: string; expiresAt: number }>();

async function getAccessToken(
	serviceAccount: GoogleServiceAccount,
): Promise<string> {
	const cached = accessTokens.get(serviceAccount.clientEmail);
	if (cached && cached.expiresAt - ACCESS_TOKEN_MARGIN_MS > Date.now()) {
		return cached.token;
	}

	// OAuth 2.0 JWT bearer grant (RFC 7523), as Google service accounts use.
	const key = await importPKCS8(serviceAccount.privateKey, "RS256");
	const assertion = await new SignJWT({ scope: SCOPE })
		.setProtectedHeader({ alg: "RS256", typ: "JWT" })
		.setIssuer(serviceAccount.clientEmail)
		.setAudience(serviceAccount.tokenUri)
		.setIssuedAt()
		.setExpirationTime("1h")
		.sign(key);

	const response = await fetch(serviceAccount.tokenUri, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
			assertion,
		}),
	});
	if (!response.ok) {
		throw new GoogleWalletApiError(
			response.status,
			"access token request refused",
		);
	}

	const body = accessTokenResponseSchema.parse(await response.json());
	accessTokens.set(serviceAccount.clientEmail, {
		token: body.access_token,
		expiresAt: Date.now() + body.expires_in * 1000,
	});
	return body.access_token;
}

async function readErrorMessage(response: Response): Promise<string> {
	try {
		const body = errorResponseSchema.safeParse(await response.json());
		return body.success ? body.data.error.message : response.statusText;
	} catch {
		return response.statusText;
	}
}

export function createGoogleWalletClient(serviceAccount: GoogleServiceAccount) {
	async function request(
		method: string,
		path: string,
		body?: unknown,
	): Promise<Response> {
		const response = await fetch(`${API_URL}${path}`, {
			method,
			headers: {
				authorization: `Bearer ${await getAccessToken(serviceAccount)}`,
				"content-type": "application/json",
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		if (response.status === 401) {
			// Revoked or expired early: sign a new token next time.
			accessTokens.delete(serviceAccount.clientEmail);
		}
		return response;
	}

	async function expectOk(response: Response): Promise<void> {
		if (!response.ok) {
			throw new GoogleWalletApiError(
				response.status,
				await readErrorMessage(response),
			);
		}
	}

	/** Inserts the resource, or replaces it when its ID already exists. */
	async function upsert(
		resource: "loyaltyClass" | "loyaltyObject",
		body: { id: string },
	) {
		const inserted = await request("POST", `/${resource}`, body);
		if (inserted.status !== 409) {
			return expectOk(inserted);
		}
		await expectOk(
			await request("PUT", `/${resource}/${encodeURIComponent(body.id)}`, body),
		);
	}

	return {
		upsertLoyaltyClass(loyaltyClass: GoogleLoyaltyClass): Promise<void> {
			return upsert("loyaltyClass", loyaltyClass);
		},

		upsertLoyaltyObject(loyaltyObject: GoogleLoyaltyObject): Promise<void> {
			return upsert("loyaltyObject", loyaltyObject);
		},

		async setLoyaltyPoints(objectId: string, points: number): Promise<void> {
			await expectOk(
				await request(
					"PATCH",
					`/loyaltyObject/${encodeURIComponent(objectId)}`,
					{
						loyaltyPoints: buildLoyaltyPoints(points),
					},
				),
			);
		},

		/**
		 * Shows a message on every pass of the class and notifies their holders.
		 * Google allows at most 3 notifications per pass every 24 hours.
		 */
		async addLoyaltyClassMessage(
			classId: string,
			message: { header: string; body: string },
		): Promise<void> {
			await expectOk(
				await request(
					"POST",
					`/loyaltyClass/${encodeURIComponent(classId)}/addMessage`,
					{
						message: { ...message, messageType: "TEXT_AND_NOTIFY" },
					},
				),
			);
		},

		/**
		 * Link that adds existing objects to the user's Google Wallet. Objects
		 * are referenced by ID, which keeps the URL short.
		 */
		async createSaveUrl(params: {
			objectIds: string[];
			origins: string[];
		}): Promise<string> {
			const key = await importPKCS8(serviceAccount.privateKey, "RS256");
			const token = await new SignJWT({
				origins: params.origins,
				typ: "savetowallet",
				payload: { loyaltyObjects: params.objectIds.map((id) => ({ id })) },
			})
				.setProtectedHeader({ alg: "RS256", typ: "JWT" })
				.setIssuer(serviceAccount.clientEmail)
				.setAudience("google")
				.setIssuedAt()
				.sign(key);
			return `${SAVE_URL}/${token}`;
		},
	};
}

export type GoogleWalletClient = ReturnType<typeof createGoogleWalletClient>;
