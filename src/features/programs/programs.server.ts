import type { SupabaseClient } from "@supabase/supabase-js";

import {
	MAX_PROGRAM_IMAGE_BYTES,
	PROGRAM_IMAGE_NAMES,
	PROGRAM_IMAGES,
	type ProgramImageName,
} from "#/features/programs/programs.schemas";
import type { WalletSyncResult } from "#/features/wallet-sync/wallet-sync";
import { getOptionalGoogleWalletConfig } from "#/lib/config.server";
import type { Database, Tables } from "#/lib/supabase/database.types";
import { createGoogleWalletClient } from "#/lib/wallet/google/client.server";
import { buildLoyaltyClass } from "#/lib/wallet/google/objects";

type Supabase = SupabaseClient<Database>;
type ProgramRow = Pick<
	Tables<"programs">,
	| "id"
	| "name"
	| "background_color"
	| "initial_points"
	| "logo_path"
	| "created_at"
>;
export type ProgramImages = Record<ProgramImageName, Uint8Array<ArrayBuffer>>;

const BUCKET = "program-assets";
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export const PROGRAM_COLUMNS =
	"id, name, background_color, initial_points, logo_path, created_at" as const;

/** What the browser receives: no storage paths, ready-to-use image URLs. */
export interface ProgramView {
	id: string;
	name: string;
	backgroundColor: string;
	initialPoints: number;
	logoUrl: string | null;
	createdAt: string;
}

function imageUrl(supabase: Supabase, folder: string, name: ProgramImageName) {
	return supabase.storage.from(BUCKET).getPublicUrl(`${folder}/${name}`).data
		.publicUrl;
}

export function toProgramView(
	supabase: Supabase,
	row: ProgramRow,
): ProgramView {
	return {
		id: row.id,
		name: row.name,
		backgroundColor: row.background_color,
		initialPoints: row.initial_points,
		logoUrl: row.logo_path
			? imageUrl(supabase, row.logo_path, "apple-logo@2x.png")
			: null,
		createdAt: row.created_at,
	};
}

/** PNG dimensions, read from the IHDR chunk, or `null` if not a PNG. */
function readPngSize(bytes: Uint8Array) {
	if (
		bytes.length < 24 ||
		PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)
	) {
		return null;
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return { width: view.getUint32(16), height: view.getUint32(20) };
}

function hasExpectedSize(name: ProgramImageName, bytes: Uint8Array): boolean {
	const size = readPngSize(bytes);
	const spec = PROGRAM_IMAGES[name];
	if (!size) {
		return false;
	}
	return spec.fit === "square"
		? size.width === spec.width && size.height === spec.height
		: size.width > 0 &&
				size.height > 0 &&
				size.width <= spec.width &&
				size.height <= spec.height;
}

/**
 * Reads the images generated in the browser from the uploaded logo. Returns
 * `null` when the form does not change the logo.
 */
export async function readProgramImages(
	formData: FormData,
): Promise<ProgramImages | null> {
	const files = PROGRAM_IMAGE_NAMES.map(
		(name) => [name, formData.get(name)] as const,
	);
	if (files.every(([, file]) => file === null)) {
		return null;
	}

	const images: Partial<ProgramImages> = {};
	for (const [name, file] of files) {
		if (!(file instanceof File)) {
			throw new Error("Some logo images are missing. Choose the logo again.");
		}
		if (file.size > MAX_PROGRAM_IMAGE_BYTES) {
			throw new Error("This logo is too detailed. Use a simpler image.");
		}
		const bytes = new Uint8Array(await file.arrayBuffer());
		if (!hasExpectedSize(name, bytes)) {
			throw new Error("The logo images are invalid. Choose the logo again.");
		}
		images[name] = bytes;
	}
	return images as ProgramImages;
}

/**
 * Each logo version gets its own folder (`{owner}/{program}/{version}`), so
 * URLs never change content and Google Wallet or CDNs never show a stale logo.
 */
export function newImageFolder(ownerId: string, programId: string): string {
	return `${ownerId}/${programId}/${Date.now().toString(36)}`;
}

export async function uploadProgramImages(
	supabase: Supabase,
	folder: string,
	images: ProgramImages,
): Promise<void> {
	await Promise.all(
		Object.entries(images).map(async ([name, bytes]) => {
			const { error } = await supabase.storage
				.from(BUCKET)
				.upload(`${folder}/${name}`, bytes, {
					contentType: "image/png",
					cacheControl: "31536000",
				});
			if (error) {
				throw new Error(`Could not upload the logo: ${error.message}`);
			}
		}),
	);
}

export async function downloadProgramImage(
	supabase: Supabase,
	folder: string,
	name: ProgramImageName,
): Promise<Uint8Array<ArrayBuffer>> {
	const { data, error } = await supabase.storage
		.from(BUCKET)
		.download(`${folder}/${name}`);
	if (error) {
		throw new Error(`Could not download ${folder}/${name}: ${error.message}`);
	}
	return new Uint8Array(await data.arrayBuffer());
}

/** Best effort: a leftover image is harmless, so failures are only logged. */
export async function removeProgramImages(
	supabase: Supabase,
	folder: string,
): Promise<void> {
	const { error } = await supabase.storage
		.from(BUCKET)
		.remove(PROGRAM_IMAGE_NAMES.map((name) => `${folder}/${name}`));
	if (error) {
		console.error("Could not remove program images", folder, error.message);
	}
}

/**
 * Creates or updates the program's Google Wallet class. Never throws: the
 * program is saved either way, and saving it again retries the sync.
 */
export async function syncGoogleLoyaltyClass(
	supabase: Supabase,
	row: Pick<ProgramRow, "id" | "name" | "background_color" | "logo_path">,
): Promise<WalletSyncResult> {
	const config = getOptionalGoogleWalletConfig();
	if (!config || !row.logo_path) {
		return "skipped";
	}
	try {
		const loyaltyClass = buildLoyaltyClass(
			{
				classSuffix: row.id,
				programName: row.name,
				backgroundColor: row.background_color,
				logoUrl: imageUrl(supabase, row.logo_path, "google-logo.png"),
			},
			config,
		);
		await createGoogleWalletClient(config.serviceAccount).upsertLoyaltyClass(
			loyaltyClass,
		);
		return "synced";
	} catch (error) {
		console.error("Google Wallet class sync failed", row.id, error);
		return "failed";
	}
}
