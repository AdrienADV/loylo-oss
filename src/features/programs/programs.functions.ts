import type { PostgrestError } from "@supabase/supabase-js";
import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { authMiddleware } from "#/features/auth/auth.middleware";
import {
	programFieldsSchema,
	programIdSchema,
} from "#/features/programs/programs.schemas";
import {
	newImageFolder,
	PROGRAM_COLUMNS,
	readProgramImages,
	removeProgramImages,
	syncGoogleLoyaltyClass,
	toProgramView,
	uploadProgramImages,
} from "#/features/programs/programs.server";

/**
 * Row Level Security limits every query to the signed-in merchant's programs:
 * another merchant's program ID behaves like a missing one.
 */

function databaseError(action: string, error: PostgrestError): Error {
	console.error(`Could not ${action}`, error.code, error.message);
	return new Error(`Could not ${action}. Try again in a moment.`);
}

/** Program forms are sent as FormData: text fields plus the generated images. */
function parseProgramForm(data: unknown) {
	if (!(data instanceof FormData)) {
		throw new Error("Expected form data");
	}
	const fields = programFieldsSchema.parse({
		name: data.get("name"),
		backgroundColor: data.get("backgroundColor"),
		initialPoints: data.get("initialPoints"),
	});
	return { fields, formData: data };
}

export const listPrograms = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const { data, error } = await context.supabase
			.from("programs")
			.select(PROGRAM_COLUMNS)
			.order("created_at", { ascending: false });
		if (error) {
			throw databaseError("load your programs", error);
		}
		return data.map((row) => toProgramView(context.supabase, row));
	});

export const getProgram = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(programIdSchema)
	.handler(async ({ data, context }) => {
		const { data: row, error } = await context.supabase
			.from("programs")
			.select(PROGRAM_COLUMNS)
			.eq("id", data.programId)
			.maybeSingle();
		if (error) {
			throw databaseError("load the program", error);
		}
		if (!row) {
			throw notFound();
		}
		return toProgramView(context.supabase, row);
	});

export const createProgram = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(parseProgramForm)
	.handler(async ({ data: { fields, formData }, context }) => {
		const images = await readProgramImages(formData);
		if (!images) {
			throw new Error("Add a logo.");
		}

		const programId = crypto.randomUUID();
		const folder = newImageFolder(context.userId, programId);
		await uploadProgramImages(context.supabase, folder, images);

		const { data: row, error } = await context.supabase
			.from("programs")
			.insert({
				id: programId,
				name: fields.name,
				background_color: fields.backgroundColor,
				initial_points: fields.initialPoints,
				logo_path: folder,
			})
			.select(PROGRAM_COLUMNS)
			.single();
		if (error) {
			await removeProgramImages(context.supabase, folder);
			throw databaseError("create the program", error);
		}

		return {
			programId: row.id,
			googleWallet: await syncGoogleLoyaltyClass(context.supabase, row),
		};
	});

export const updateProgram = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator((data: unknown) => {
		const form = parseProgramForm(data);
		return {
			...form,
			...programIdSchema.parse({ programId: form.formData.get("programId") }),
		};
	})
	.handler(async ({ data: { programId, fields, formData }, context }) => {
		const { data: current, error: readError } = await context.supabase
			.from("programs")
			.select("logo_path")
			.eq("id", programId)
			.maybeSingle();
		if (readError) {
			throw databaseError("update the program", readError);
		}
		if (!current) {
			throw notFound();
		}

		const images = await readProgramImages(formData);
		const folder = images
			? newImageFolder(context.userId, programId)
			: current.logo_path;
		if (images && folder) {
			await uploadProgramImages(context.supabase, folder, images);
		}

		const { data: row, error } = await context.supabase
			.from("programs")
			.update({
				name: fields.name,
				background_color: fields.backgroundColor,
				initial_points: fields.initialPoints,
				logo_path: folder,
			})
			.eq("id", programId)
			.select(PROGRAM_COLUMNS)
			.maybeSingle();
		if (error || !row) {
			if (images && folder) {
				await removeProgramImages(context.supabase, folder);
			}
			if (error) {
				throw databaseError("update the program", error);
			}
			throw notFound();
		}
		if (images && current.logo_path) {
			await removeProgramImages(context.supabase, current.logo_path);
		}

		return {
			program: toProgramView(context.supabase, row),
			googleWallet: await syncGoogleLoyaltyClass(context.supabase, row),
		};
	});

export const deleteProgram = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(programIdSchema)
	.handler(async ({ data, context }) => {
		const { data: row, error } = await context.supabase
			.from("programs")
			.delete()
			.eq("id", data.programId)
			.select("logo_path")
			.maybeSingle();
		if (error) {
			throw databaseError("delete the program", error);
		}
		if (!row) {
			throw notFound();
		}
		// Google Wallet classes cannot be deleted; without passes, they stay unused.
		if (row.logo_path) {
			await removeProgramImages(context.supabase, row.logo_path);
		}
	});
