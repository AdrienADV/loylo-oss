import { Buffer } from "node:buffer";
import { PKPass } from "passkit-generator";

import type { ApplePassJson } from "#/lib/wallet/apple/pass-json";

/** PEM-encoded material used to sign passes. */
export interface ApplePassCertificates {
	/** Apple Worldwide Developer Relations intermediate certificate. */
	wwdr: string;
	/** Pass Type ID certificate. */
	signerCert: string;
	/** Private key of the Pass Type ID certificate. */
	signerKey: string;
	signerKeyPassphrase?: string;
}

type ApplePassImageName =
	| "icon.png"
	| "icon@2x.png"
	| "logo.png"
	| "logo@2x.png";

/** PNG files of the pass. Wallet refuses passes without `icon.png`. */
export type ApplePassImages = Record<"icon.png", Uint8Array> &
	Partial<Record<Exclude<ApplePassImageName, "icon.png">, Uint8Array>>;

interface CreatePkpassParams {
	passJson: ApplePassJson;
	images: ApplePassImages;
	certificates: ApplePassCertificates;
}

/**
 * Bundles and signs a `.pkpass` archive: `pass.json`, images, `manifest.json`
 * (SHA-1 of every file) and `signature` (detached PKCS#7 of the manifest).
 */
export function createPkpass({
	passJson,
	images,
	certificates,
}: CreatePkpassParams): Uint8Array<ArrayBuffer> {
	const files: Record<string, Buffer> = {
		"pass.json": Buffer.from(JSON.stringify(passJson)),
	};
	for (const [name, content] of Object.entries(images)) {
		if (content) files[name] = Buffer.from(content);
	}

	const pass = new PKPass(files, certificates);
	return new Uint8Array(pass.getAsBuffer());
}
