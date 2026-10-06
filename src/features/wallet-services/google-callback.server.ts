import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "#/lib/supabase/database.types";
import type { GoogleCallbackMessage } from "#/lib/wallet/google/callback.server";

type Supabase = SupabaseClient<Database>;

/**
 * Records a verified save or delete callback as the pass's install state.
 * Object IDs are `{issuer}.{wallet pass id}`; others are ignored. Google may
 * send a callback twice: recording it again changes nothing.
 */
export async function recordGoogleCallback(
	supabase: Supabase,
	message: GoogleCallbackMessage,
	issuerId: string,
): Promise<"recorded" | "ignored"> {
	const passId = z
		.uuid()
		.safeParse(message.objectId.slice(`${issuerId}.`.length));
	if (!passId.success) {
		return "ignored";
	}

	const { data: pass, error: readError } = await supabase
		.from("wallet_passes")
		.select("id")
		.eq("id", passId.data)
		.eq("provider", "google")
		.maybeSingle();
	if (readError) {
		throw new Error(`Could not load the pass: ${readError.message}`);
	}
	if (!pass) {
		return "ignored";
	}

	const { error } = await supabase.rpc("record_wallet_pass_install", {
		pass_id: pass.id,
		installed: message.eventType === "save",
	});
	if (error) {
		throw new Error(`Could not record the install: ${error.message}`);
	}
	return "recorded";
}
