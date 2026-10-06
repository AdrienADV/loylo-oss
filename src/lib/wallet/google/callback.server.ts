import { z } from "zod";

/**
 * Verifies the callbacks Google Wallet sends when a pass is saved or deleted
 * (`ECv2SigningOnly` protocol, the one used by Google Pay tokens):
 *
 * 1. an intermediate key, signed by one of Google's root keys;
 * 2. the message, signed by the intermediate key, for our issuer ID.
 *
 * Signatures are ECDSA P-256 / SHA-256, DER-encoded.
 */

const ROOT_KEYS_URL = "https://pay.google.com/gp/m/issuer/keys";
const SENDER_ID = "GooglePayPasses";
const PROTOCOL_VERSION = "ECv2SigningOnly";
/** Refetch root keys at least this often, even if Google says they live longer. */
const ROOT_KEYS_MAX_AGE_MS = 60 * 60 * 1000;

const callbackBodySchema = z.object({
	protocolVersion: z.literal(PROTOCOL_VERSION),
	signature: z.base64(),
	intermediateSigningKey: z.object({
		signedKey: z.string(),
		signatures: z.array(z.base64()).min(1),
	}),
	signedMessage: z.string(),
});

const signedKeySchema = z.object({
	keyValue: z.base64(),
	keyExpiration: z.coerce.number(),
});

const callbackMessageSchema = z.object({
	classId: z.string(),
	objectId: z.string(),
	eventType: z.enum(["save", "del"]),
	expTimeMillis: z.number(),
	/** Unique per callback: Google may deliver the same one more than once. */
	nonce: z.string(),
});

export type GoogleCallbackMessage = z.infer<typeof callbackMessageSchema>;

const rootKeysSchema = z.object({
	keys: z.array(
		z.object({
			keyValue: z.base64(),
			protocolVersion: z.string(),
			keyExpiration: z.coerce.number().optional(),
		}),
	),
});

export class GoogleCallbackError extends Error {
	constructor(message: string) {
		super(`Invalid Google Wallet callback: ${message}`);
		this.name = "GoogleCallbackError";
	}
}

const textEncoder = new TextEncoder();

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
	return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

/** Each chunk is prefixed with its byte length (4 bytes, little-endian). */
function toLengthValue(...chunks: string[]): Uint8Array<ArrayBuffer> {
	const encoded = chunks.map((chunk) => textEncoder.encode(chunk));
	const result = new Uint8Array(
		encoded.reduce((size, bytes) => size + 4 + bytes.length, 0),
	);
	const view = new DataView(result.buffer);
	let offset = 0;
	for (const bytes of encoded) {
		view.setUint32(offset, bytes.length, true);
		result.set(bytes, offset + 4);
		offset += 4 + bytes.length;
	}
	return result;
}

/** WebCrypto expects `r || s` (32 bytes each), Google sends an ASN.1 DER sequence. */
function derToRawSignature(der: Uint8Array): Uint8Array<ArrayBuffer> {
	const readInteger = (offset: number) => {
		if (der[offset] !== 0x02)
			throw new GoogleCallbackError("malformed signature");
		const length = der[offset + 1];
		const value = der.subarray(offset + 2, offset + 2 + length);
		const start = value.findIndex((byte) => byte !== 0);
		const trimmed = start === -1 ? new Uint8Array(0) : value.subarray(start);
		if (trimmed.length > 32)
			throw new GoogleCallbackError("malformed signature");
		return { trimmed, next: offset + 2 + length };
	};

	if (der[0] !== 0x30 || der[1] !== der.length - 2) {
		throw new GoogleCallbackError("malformed signature");
	}
	const r = readInteger(2);
	const s = readInteger(r.next);
	if (s.next !== der.length)
		throw new GoogleCallbackError("malformed signature");

	const raw = new Uint8Array(64);
	raw.set(r.trimmed, 32 - r.trimmed.length);
	raw.set(s.trimmed, 64 - s.trimmed.length);
	return raw;
}

function parseJson<T extends z.ZodType>(
	value: string,
	schema: T,
): z.output<T> | undefined {
	try {
		const result = schema.safeParse(JSON.parse(value));
		return result.success ? result.data : undefined;
	} catch {
		return undefined;
	}
}

function importVerifyingKey(spkiBase64: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		"spki",
		base64ToBytes(spkiBase64),
		{ name: "ECDSA", namedCurve: "P-256" },
		false,
		["verify"],
	);
}

async function verifySignature(
	key: CryptoKey,
	derSignatureBase64: string,
	data: Uint8Array<ArrayBuffer>,
): Promise<boolean> {
	try {
		return await crypto.subtle.verify(
			{ name: "ECDSA", hash: "SHA-256" },
			key,
			derToRawSignature(base64ToBytes(derSignatureBase64)),
			data,
		);
	} catch {
		return false;
	}
}

/** Reused across requests served by the same isolate. */
let rootKeysCache: { keys: CryptoKey[]; expiresAt: number } | undefined;

async function getRootKeys(now: number): Promise<CryptoKey[]> {
	if (rootKeysCache && rootKeysCache.expiresAt > now) {
		return rootKeysCache.keys;
	}

	const response = await fetch(ROOT_KEYS_URL);
	if (!response.ok) {
		throw new Error(`Could not fetch Google root keys (${response.status})`);
	}
	const { keys } = rootKeysSchema.parse(await response.json());
	const validKeys = keys.filter(
		(key) =>
			key.protocolVersion === PROTOCOL_VERSION &&
			(key.keyExpiration === undefined || key.keyExpiration > now),
	);
	const expirations = validKeys.flatMap((key) => key.keyExpiration ?? []);

	rootKeysCache = {
		keys: await Promise.all(
			validKeys.map((key) => importVerifyingKey(key.keyValue)),
		),
		expiresAt: Math.min(now + ROOT_KEYS_MAX_AGE_MS, ...expirations),
	};
	return rootKeysCache.keys;
}

/**
 * Returns the callback message once its signatures, issuer and expiration are
 * checked. Throws `GoogleCallbackError` when the callback must be rejected.
 */
export async function verifyGoogleCallback(
	body: unknown,
	options: { issuerId: string; now?: number },
): Promise<GoogleCallbackMessage> {
	const now = options.now ?? Date.now();
	const callback = callbackBodySchema.safeParse(body);
	if (!callback.success) {
		throw new GoogleCallbackError("unexpected body");
	}
	const { signature, intermediateSigningKey, signedMessage } = callback.data;

	// 1. The intermediate key must be signed by a current Google root key.
	const rootKeys = await getRootKeys(now);
	const signedKeyBytes = toLengthValue(
		SENDER_ID,
		PROTOCOL_VERSION,
		intermediateSigningKey.signedKey,
	);
	const verifications = await Promise.all(
		rootKeys.flatMap((rootKey) =>
			intermediateSigningKey.signatures.map((keySignature) =>
				verifySignature(rootKey, keySignature, signedKeyBytes),
			),
		),
	);
	if (!verifications.includes(true)) {
		throw new GoogleCallbackError("intermediate key not signed by Google");
	}

	const signedKey = parseJson(
		intermediateSigningKey.signedKey,
		signedKeySchema,
	);
	if (!signedKey) {
		throw new GoogleCallbackError("unexpected intermediate key");
	}
	if (signedKey.keyExpiration <= now) {
		throw new GoogleCallbackError("intermediate key expired");
	}

	// 2. The message must be signed by the intermediate key, for our issuer.
	const intermediateKey = await importVerifyingKey(signedKey.keyValue);
	const messageBytes = toLengthValue(
		SENDER_ID,
		options.issuerId,
		PROTOCOL_VERSION,
		signedMessage,
	);
	if (!(await verifySignature(intermediateKey, signature, messageBytes))) {
		throw new GoogleCallbackError("message signature mismatch");
	}

	const message = parseJson(signedMessage, callbackMessageSchema);
	if (!message) {
		throw new GoogleCallbackError("unexpected message");
	}
	if (message.expTimeMillis <= now) {
		throw new GoogleCallbackError("message expired");
	}
	const issuerPrefix = `${options.issuerId}.`;
	if (
		!message.classId.startsWith(issuerPrefix) ||
		!message.objectId.startsWith(issuerPrefix)
	) {
		throw new GoogleCallbackError("message for another issuer");
	}
	return message;
}
