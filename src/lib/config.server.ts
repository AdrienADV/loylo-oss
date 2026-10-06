import { z } from "zod";

/**
 * Server configuration, validated from environment variables.
 *
 * On Cloudflare Workers the environment is injected per request, so these
 * getters must be called inside handlers, never at module scope.
 */

const urlWithoutTrailingSlash = z
	.url()
	.transform((url) => url.replace(/\/+$/, ""));

/** PEM content. Newlines may be escaped as `\n` to fit on one line. */
const pemSchema = z
	.string()
	.transform((value) => value.replace(/\\n/g, "\n").trim())
	.refine(
		(value) =>
			/^-----BEGIN [A-Z ]+-----\n[\s\S]+\n-----END [A-Z ]+-----$/.test(value),
		{
			message: "Expected PEM content",
		},
	);

const optionalString = z
	.string()
	.optional()
	.transform((value) => value || undefined);

const supabaseEnvSchema = z.object({
	VITE_SUPABASE_URL: z.url(),
	VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

const supabaseAdminEnvSchema = supabaseEnvSchema.extend({
	SUPABASE_SECRET_KEY: z.string().min(1),
});

const appleIdentifiersEnvSchema = z.object({
	APPLE_TEAM_ID: z
		.string()
		.regex(/^[A-Z0-9]{10}$/, "Expected a 10-character Team ID"),
	APPLE_PASS_TYPE_ID: z.string().startsWith("pass."),
});

const appleWalletEnvSchema = appleIdentifiersEnvSchema.extend({
	APP_URL: urlWithoutTrailingSlash,
	APPLE_WWDR_CERT: pemSchema,
	APPLE_SIGNER_CERT: pemSchema,
	APPLE_SIGNER_KEY: pemSchema,
	APPLE_SIGNER_KEY_PASSPHRASE: optionalString,
});

/** Service account key file, as downloaded from Google Cloud. */
const googleServiceAccountSchema = z
	.string()
	.transform((value, ctx) => {
		try {
			return JSON.parse(value) as unknown;
		} catch {
			ctx.issues.push({
				code: "custom",
				message: "Expected JSON",
				input: value,
			});
			return z.NEVER;
		}
	})
	.pipe(
		z.object({
			client_email: z.email(),
			private_key: pemSchema,
			token_uri: z.url().default("https://oauth2.googleapis.com/token"),
		}),
	);

const googleWalletEnvSchema = z.object({
	APP_URL: urlWithoutTrailingSlash,
	GOOGLE_ISSUER_ID: z.string().regex(/^\d+$/, "Expected a numeric Issuer ID"),
	GOOGLE_SERVICE_ACCOUNT_JSON: googleServiceAccountSchema,
});

function parseEnv<T extends z.ZodType>(schema: T, scope: string): z.output<T> {
	const result = schema.safeParse(process.env);
	if (!result.success) {
		// Only variable names are reported: values may be secrets.
		const names = [
			...new Set(result.error.issues.map((issue) => issue.path.join("."))),
		];
		throw new Error(
			`Invalid ${scope} configuration, check: ${names.join(", ")}`,
		);
	}
	return result.data;
}

export function getSupabaseConfig() {
	const env = parseEnv(supabaseEnvSchema, "Supabase");
	return {
		url: env.VITE_SUPABASE_URL,
		publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
	};
}

export function getSupabaseAdminConfig() {
	const env = parseEnv(supabaseAdminEnvSchema, "Supabase admin");
	return { url: env.VITE_SUPABASE_URL, secretKey: env.SUPABASE_SECRET_KEY };
}

export function getAppleWalletConfig() {
	const env = parseEnv(appleWalletEnvSchema, "Apple Wallet");

	return {
		teamId: env.APPLE_TEAM_ID,
		passTypeId: env.APPLE_PASS_TYPE_ID,
		webServiceUrl: `${env.APP_URL}/api/apple`,
		certificates: {
			wwdr: env.APPLE_WWDR_CERT,
			signerCert: env.APPLE_SIGNER_CERT,
			signerKey: env.APPLE_SIGNER_KEY,
			signerKeyPassphrase: env.APPLE_SIGNER_KEY_PASSPHRASE,
		},
	};
}

const applePushEnvSchema = appleIdentifiersEnvSchema.extend({
	APNS_KEY_ID: z
		.string()
		.regex(/^[A-Z0-9]{10}$/, "Expected a 10-character Key ID"),
	APNS_KEY: pemSchema,
});

export function getApplePushConfig() {
	const env = parseEnv(applePushEnvSchema, "Apple push");

	return {
		passTypeId: env.APPLE_PASS_TYPE_ID,
		credentials: {
			teamId: env.APPLE_TEAM_ID,
			keyId: env.APNS_KEY_ID,
			privateKey: env.APNS_KEY,
		},
	};
}

export function getGoogleWalletConfig() {
	const env = parseEnv(googleWalletEnvSchema, "Google Wallet");
	const serviceAccount = env.GOOGLE_SERVICE_ACCOUNT_JSON;

	return {
		issuerId: env.GOOGLE_ISSUER_ID,
		callbackUrl: `${env.APP_URL}/api/google/callback`,
		origins: [env.APP_URL],
		serviceAccount: {
			clientEmail: serviceAccount.client_email,
			privateKey: serviceAccount.private_key,
			tokenUri: serviceAccount.token_uri,
		},
	};
}
