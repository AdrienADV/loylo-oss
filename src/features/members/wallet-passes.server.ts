import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { WalletProvider } from "#/features/members/members.schemas";
import type { ProgramImageName } from "#/features/programs/programs.schemas";
import {
	downloadProgramImage,
	syncGoogleLoyaltyClass,
} from "#/features/programs/programs.server";
import {
	type AppleWalletConfig,
	type GoogleWalletConfig,
	getOptionalAppleWalletConfig,
	getOptionalGoogleWalletConfig,
} from "#/lib/config.server";
import type { Database } from "#/lib/supabase/database.types";
import { buildApplePassJson } from "#/lib/wallet/apple/pass-json";
import {
	type ApplePassImages,
	createPkpass,
} from "#/lib/wallet/apple/pkpass.server";
import { createGoogleWalletClient } from "#/lib/wallet/google/client.server";
import { buildLoyaltyObject } from "#/lib/wallet/google/objects";

/**
 * Delivery of wallet passes. A pass is a pure function of database rows: the
 * Apple file and the Google object are rebuilt from them on every download.
 */

type Supabase = SupabaseClient<Database>;

/** Wallets this deployment can issue passes for. */
export function getAvailableWallets(): Record<WalletProvider, boolean> {
	return {
		apple: getOptionalAppleWalletConfig() !== null,
		google: getOptionalGoogleWalletConfig() !== null,
	};
}

/**
 * Link that adds a pass to its wallet. It carries the pass's secret token:
 * only the member, and the merchant who issued the pass, ever get it.
 */
export function passLinkPath(pass: {
	provider: WalletProvider;
	serialNumber: string;
	authenticationToken: string;
}): string {
	return `/api/${pass.provider}/passes/${pass.serialNumber}?token=${pass.authenticationToken}`;
}

const passLinkSchema = z.object({
	serialNumber: z.string().regex(/^[0-9a-f]{32}$/),
	token: z.string().regex(/^[0-9a-f]{64}$/),
});

/** Reads a pass link's serial number and token, or `null` if malformed. */
export function parsePassLink(serialNumber: string, request: Request) {
	const link = passLinkSchema.safeParse({
		serialNumber,
		token: new URL(request.url).searchParams.get("token"),
	});
	return link.success ? link.data : null;
}

/** Compares secrets in constant time, so response times reveal nothing. */
function secretsMatch(actual: string, expected: string): boolean {
	if (actual.length !== expected.length) {
		return false;
	}
	let difference = 0;
	for (let index = 0; index < actual.length; index++) {
		difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
	}
	return difference === 0;
}

const PASS_COLUMNS =
	"id, serial_number, authentication_token, created_at, member:members!inner(first_name, last_name, points, updated_at, program:programs!inner(id, name, background_color, logo_path, wallet_message, updated_at))" as const;

/**
 * The pass with this serial number, or `null` when it does not exist or the
 * token is not its secret. Pass links and Apple Wallet's web service calls
 * both authenticate this way.
 */
export async function findPassByToken(
	supabase: Supabase,
	provider: WalletProvider,
	credentials: { serialNumber: string; token: string },
) {
	const { data, error } = await supabase
		.from("wallet_passes")
		.select(PASS_COLUMNS)
		.eq("serial_number", credentials.serialNumber)
		.eq("provider", provider)
		.maybeSingle();
	if (error) {
		throw new Error(`Could not load the pass: ${error.message}`);
	}
	if (!data || !secretsMatch(data.authentication_token, credentials.token)) {
		return null;
	}
	return data;
}

type WalletPass = NonNullable<Awaited<ReturnType<typeof findPassByToken>>>;

/**
 * When the pass content last changed: it is built from the member and the
 * program. Same rule as `list_apple_device_passes` in the database.
 */
export function passContentUpdatedAt(pass: WalletPass): Date {
	return new Date(
		Math.max(
			Date.parse(pass.created_at),
			Date.parse(pass.member.updated_at),
			Date.parse(pass.member.program.updated_at),
		),
	);
}

function memberName(pass: WalletPass): string {
	return `${pass.member.first_name} ${pass.member.last_name}`;
}

/** Program images used by Apple passes, by file name in the pass. */
const APPLE_PASS_IMAGES = {
	"icon.png": "apple-icon.png",
	"icon@2x.png": "apple-icon@2x.png",
	"logo.png": "apple-logo.png",
	"logo@2x.png": "apple-logo@2x.png",
} as const satisfies Record<keyof ApplePassImages, ProgramImageName>;

/** Builds and signs the member's `.pkpass` file. */
export async function createApplePassFile(
	supabase: Supabase,
	pass: WalletPass,
	config: AppleWalletConfig,
): Promise<Uint8Array<ArrayBuffer>> {
	const { program } = pass.member;
	const folder = program.logo_path;
	if (!folder) {
		throw new Error(`Program ${program.id} has no images`);
	}

	const images = Object.fromEntries(
		await Promise.all(
			Object.entries(APPLE_PASS_IMAGES).map(
				async ([passName, imageName]) =>
					[
						passName,
						await downloadProgramImage(supabase, folder, imageName),
					] as const,
			),
		),
	) as ApplePassImages;

	const passJson = buildApplePassJson(
		{
			program: {
				name: program.name,
				backgroundColor: program.background_color,
				message: program.wallet_message,
			},
			member: { name: memberName(pass), points: pass.member.points },
			pass: {
				serialNumber: pass.serial_number,
				authenticationToken: pass.authentication_token,
			},
		},
		config,
	);
	return createPkpass({ passJson, images, certificates: config.certificates });
}

/**
 * Creates or refreshes the member's Google Wallet object, then returns the
 * link that saves it. The class is synced first: it may be missing (Google
 * was down or not configured when the program was saved). Both writes are
 * idempotent, so opening the link again retries after a failure.
 */
export async function createGoogleSaveUrl(
	supabase: Supabase,
	pass: WalletPass,
	config: GoogleWalletConfig,
): Promise<string> {
	const { program } = pass.member;
	const classSync = await syncGoogleLoyaltyClass(supabase, program);
	if (classSync !== "synced") {
		throw new Error(`Google Wallet class not synced (${classSync})`);
	}

	const client = createGoogleWalletClient(config.serviceAccount);
	const loyaltyObject = buildLoyaltyObject(
		{
			classSuffix: program.id,
			// Not the serial number: object IDs show up in save links.
			objectSuffix: pass.id,
			serialNumber: pass.serial_number,
			memberName: memberName(pass),
			points: pass.member.points,
		},
		config,
	);
	await client.upsertLoyaltyObject(loyaltyObject);
	return client.createSaveUrl({
		objectIds: [loyaltyObject.id],
		origins: config.origins,
	});
}
