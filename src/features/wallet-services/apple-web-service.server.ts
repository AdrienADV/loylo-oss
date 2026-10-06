import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { findPassByToken } from "#/features/members/wallet-passes.server";
import {
	type AppleWalletConfig,
	getOptionalAppleWalletConfig,
} from "#/lib/config.server";
import type { Database } from "#/lib/supabase/database.types";

/**
 * Apple's PassKit Web Service (`webServiceURL = {APP_URL}/api/apple`): Wallet
 * registers the devices holding a pass, asks which passes changed after a
 * push, and downloads their latest version.
 */

type Supabase = SupabaseClient<Database>;

/** Apple Wallet's configuration, when this request targets our pass type. */
export function getWebServiceConfig(
	passTypeIdentifier: string,
): AppleWalletConfig | null {
	const config = getOptionalAppleWalletConfig();
	return config?.passTypeId === passTypeIdentifier ? config : null;
}

export const deviceLibraryIdentifierSchema = z
	.string()
	.regex(/^[A-Za-z0-9._-]{1,128}$/);

const serialNumberSchema = z.string().regex(/^[0-9a-f]{32}$/);

/** Wallet authenticates with the pass's token: `Authorization: ApplePass {token}`. */
const authorizationSchema = z
	.string()
	.regex(/^ApplePass [0-9a-f]{64}$/)
	.transform((header) => header.slice("ApplePass ".length));

/** The Apple pass the request is authorized for, or `null`. */
export async function authenticatePass(
	supabase: Supabase,
	request: Request,
	serialNumber: string,
) {
	const serial = serialNumberSchema.safeParse(serialNumber);
	const token = authorizationSchema.safeParse(
		request.headers.get("authorization"),
	);
	if (!serial.success || !token.success) {
		return null;
	}
	return findPassByToken(supabase, "apple", {
		serialNumber: serial.data,
		token: token.data,
	});
}

export const registrationBodySchema = z.object({
	pushToken: z.string().regex(/^[0-9A-Fa-f]{16,200}$/),
});

/** Returns whether the device was not registered for this pass yet. */
export async function registerDevice(
	supabase: Supabase,
	params: {
		deviceLibraryIdentifier: string;
		pushToken: string;
		passId: string;
	},
): Promise<boolean> {
	const { data, error } = await supabase.rpc("register_apple_device", {
		device_library_identifier: params.deviceLibraryIdentifier,
		push_token: params.pushToken,
		pass_id: params.passId,
	});
	if (error) {
		throw new Error(`Could not register the device: ${error.message}`);
	}
	return data;
}

export async function unregisterDevice(
	supabase: Supabase,
	params: { deviceLibraryIdentifier: string; passId: string },
): Promise<void> {
	const { error } = await supabase.rpc("unregister_apple_device", {
		device_library_identifier: params.deviceLibraryIdentifier,
		pass_id: params.passId,
	});
	if (error) {
		throw new Error(`Could not unregister the device: ${error.message}`);
	}
}

/**
 * `passesUpdatedSince` is the `lastUpdated` tag we returned before: a
 * timestamp. Anything else lists every pass of the device.
 */
const updatedSinceSchema = z.iso.datetime({ offset: true }).nullable();

/**
 * Serial numbers of the device's passes that changed since the tag, and the
 * tag to send back, or `null` when none changed.
 */
export async function listUpdatedPasses(
	supabase: Supabase,
	deviceLibraryIdentifier: string,
	passesUpdatedSince: string | null,
): Promise<{ serialNumbers: string[]; lastUpdated: string } | null> {
	const since = updatedSinceSchema.safeParse(passesUpdatedSince);
	const { data, error } = await supabase.rpc("list_apple_device_passes", {
		device_library_identifier: deviceLibraryIdentifier,
		updated_since: since.success ? (since.data ?? undefined) : undefined,
	});
	if (error) {
		throw new Error(`Could not list the device's passes: ${error.message}`);
	}
	if (data.length === 0) {
		return null;
	}
	return {
		serialNumbers: data.map((row) => row.serial_number),
		lastUpdated: data[0].last_updated,
	};
}

const logBodySchema = z.object({ logs: z.array(z.string()) });

/** Wallet reports errors with our passes or web service here. */
export function logWalletMessages(body: unknown): void {
	const parsed = logBodySchema.safeParse(body);
	if (!parsed.success) {
		return;
	}
	for (const message of parsed.data.logs.slice(0, 20)) {
		console.warn("Apple Wallet log:", message.slice(0, 1000));
	}
}
