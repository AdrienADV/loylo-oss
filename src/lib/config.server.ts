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

const appleWalletEnvSchema = z.object({
	APP_URL: urlWithoutTrailingSlash,
	APPLE_TEAM_ID: z
		.string()
		.regex(/^[A-Z0-9]{10}$/, "Expected a 10-character Team ID"),
	APPLE_PASS_TYPE_ID: z.string().startsWith("pass."),
	APPLE_WWDR_CERT: pemSchema,
	APPLE_SIGNER_CERT: pemSchema,
	APPLE_SIGNER_KEY: pemSchema,
	APPLE_SIGNER_KEY_PASSPHRASE: optionalString,
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
