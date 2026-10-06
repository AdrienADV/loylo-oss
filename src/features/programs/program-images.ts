import {
	MAX_PROGRAM_IMAGE_BYTES,
	PROGRAM_IMAGE_NAMES,
	PROGRAM_IMAGES,
	type ProgramImageName,
} from "#/features/programs/programs.schemas";

/**
 * Turns the uploaded logo into the PNG images Apple and Google Wallet need.
 * Done in the browser: Workers cannot run native image libraries.
 */

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function drawImage(
	bitmap: ImageBitmap,
	spec: (typeof PROGRAM_IMAGES)[ProgramImageName],
): Promise<Blob> {
	// Fit the whole logo in the box, keeping its proportions.
	const scale = Math.min(
		spec.width / bitmap.width,
		spec.height / bitmap.height,
	);
	const width = Math.max(1, Math.round(bitmap.width * scale));
	const height = Math.max(1, Math.round(bitmap.height * scale));

	const canvas = document.createElement("canvas");
	canvas.width = spec.fit === "square" ? spec.width : width;
	canvas.height = spec.fit === "square" ? spec.height : height;
	const context = canvas.getContext("2d");
	if (!context) {
		throw new Error("Your browser cannot process images.");
	}
	context.imageSmoothingQuality = "high";
	context.drawImage(
		bitmap,
		(canvas.width - width) / 2,
		(canvas.height - height) / 2,
		width,
		height,
	);

	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) =>
				blob ? resolve(blob) : reject(new Error("Could not process the logo.")),
			"image/png",
		);
	});
}

export async function renderProgramImages(
	file: File,
): Promise<Record<ProgramImageName, Blob>> {
	if (!ACCEPTED_TYPES.includes(file.type)) {
		throw new Error("Use a PNG, JPEG or WebP image.");
	}
	if (file.size > MAX_UPLOAD_BYTES) {
		throw new Error("Use an image smaller than 10 MB.");
	}

	const bitmap = await createImageBitmap(file);
	try {
		const entries = await Promise.all(
			PROGRAM_IMAGE_NAMES.map(
				async (name) =>
					[name, await drawImage(bitmap, PROGRAM_IMAGES[name])] as const,
			),
		);
		if (entries.some(([, blob]) => blob.size > MAX_PROGRAM_IMAGE_BYTES)) {
			throw new Error("This logo is too detailed. Use a simpler image.");
		}
		return Object.fromEntries(entries) as Record<ProgramImageName, Blob>;
	} finally {
		bitmap.close();
	}
}
