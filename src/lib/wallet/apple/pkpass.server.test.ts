import * as asn1js from "asn1js";
import { unzipSync } from "fflate";
import * as pkijs from "pkijs";
import { beforeAll, describe, expect, it } from "vitest";

import {
	applePassJsonSchema,
	buildApplePassJson,
} from "#/lib/wallet/apple/pass-json";
import {
	type ApplePassCertificates,
	createPkpass,
} from "#/lib/wallet/apple/pkpass.server";

/**
 * Validates generated `.pkpass` archives the way Wallet does, inside workerd:
 * file list, manifest hashes, `pass.json` content and PKCS#7 signature.
 *
 * Certificates are generated for the test (a stand-in WWDR authority and a
 * signer certificate it issues), so no Apple secret is needed.
 */

const OID = {
	commonName: "2.5.4.3",
	basicConstraints: "2.5.29.19",
	keyUsage: "2.5.29.15",
	signingTime: "1.2.840.113549.1.9.5",
};

const rsaAlgorithm: RsaHashedKeyGenParams = {
	name: "RSASSA-PKCS1-v1_5",
	modulusLength: 2048,
	publicExponent: new Uint8Array([1, 0, 1]),
	hash: "SHA-256",
};

// 1×1 transparent PNG: Wallet only needs the files to exist for this test.
const PNG = Uint8Array.from(
	atob(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
	),
	(char) => char.charCodeAt(0),
);

const passInput = {
	program: {
		name: "Café de la Place",
		backgroundColor: "#1D4FD7",
		message: null,
	},
	member: { name: "Ada Lovelace", points: 120 },
	pass: {
		serialNumber: "3f8a1c2e9b7d4f60a5e1c3b2d4f6a8c0",
		authenticationToken: "b1946ac92492d2347c6235b4d2611184",
	},
};

const passOptions = {
	teamId: "ABCDE12345",
	passTypeId: "pass.org.loylo.test",
	webServiceUrl: "https://loylo.example.org/api/apple",
};

function toPem(der: ArrayBuffer, label: string): string {
	const base64 = btoa(String.fromCharCode(...new Uint8Array(der)));
	const lines = base64.match(/.{1,64}/g) ?? [];
	return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
}

function sha1Hex(data: Uint8Array<ArrayBuffer>): Promise<string> {
	return crypto.subtle
		.digest("SHA-1", data)
		.then((hash) =>
			Array.from(new Uint8Array(hash), (b) =>
				b.toString(16).padStart(2, "0"),
			).join(""),
		);
}

function commonName(value: string): pkijs.AttributeTypeAndValue {
	return new pkijs.AttributeTypeAndValue({
		type: OID.commonName,
		value: new asn1js.Utf8String({ value }),
	});
}

async function issueCertificate(params: {
	subject: string;
	issuer: string;
	serial: number;
	publicKey: CryptoKey;
	issuerKey: CryptoKey;
	isAuthority: boolean;
}): Promise<pkijs.Certificate> {
	const certificate = new pkijs.Certificate();
	certificate.version = 2;
	certificate.serialNumber = new asn1js.Integer({ value: params.serial });
	certificate.subject.typesAndValues.push(commonName(params.subject));
	certificate.issuer.typesAndValues.push(commonName(params.issuer));
	certificate.notBefore.value = new Date(Date.now() - 60_000);
	certificate.notAfter.value = new Date(Date.now() + 86_400_000);

	const keyUsage = new asn1js.BitString({
		// keyCertSign (bit 5) for the authority, digitalSignature (bit 0) for the signer.
		valueHex: new Uint8Array([params.isAuthority ? 0x04 : 0x80]).buffer,
		unusedBits: params.isAuthority ? 2 : 7,
	});
	certificate.extensions = [
		new pkijs.Extension({
			extnID: OID.basicConstraints,
			critical: true,
			extnValue: new pkijs.BasicConstraints({ cA: params.isAuthority })
				.toSchema()
				.toBER(false),
		}),
		new pkijs.Extension({
			extnID: OID.keyUsage,
			critical: true,
			extnValue: keyUsage.toBER(false),
		}),
	];

	await certificate.subjectPublicKeyInfo.importKey(params.publicKey);
	await certificate.sign(params.issuerKey, "SHA-256");
	return certificate;
}

async function createTestCertificates() {
	const authorityKeys = await crypto.subtle.generateKey(rsaAlgorithm, true, [
		"sign",
		"verify",
	]);
	const signerKeys = await crypto.subtle.generateKey(rsaAlgorithm, true, [
		"sign",
		"verify",
	]);

	const authority = await issueCertificate({
		subject: "Test WWDR",
		issuer: "Test WWDR",
		serial: 1,
		publicKey: authorityKeys.publicKey,
		issuerKey: authorityKeys.privateKey,
		isAuthority: true,
	});
	const signer = await issueCertificate({
		subject: `Pass Type ID: ${passOptions.passTypeId}`,
		issuer: "Test WWDR",
		serial: 2,
		publicKey: signerKeys.publicKey,
		issuerKey: authorityKeys.privateKey,
		isAuthority: false,
	});

	const certificates: ApplePassCertificates = {
		wwdr: toPem(authority.toSchema().toBER(false), "CERTIFICATE"),
		signerCert: toPem(signer.toSchema().toBER(false), "CERTIFICATE"),
		signerKey: toPem(
			await crypto.subtle.exportKey("pkcs8", signerKeys.privateKey),
			"PRIVATE KEY",
		),
	};
	return { certificates, authority };
}

function verifySignature(
	signature: Uint8Array<ArrayBuffer>,
	manifest: Uint8Array<ArrayBuffer>,
	trustedAuthority: pkijs.Certificate,
) {
	const signedData = new pkijs.SignedData({
		schema: pkijs.ContentInfo.fromBER(signature).content,
	});
	return signedData.verify({
		signer: 0,
		data: manifest.buffer,
		trustedCerts: [trustedAuthority],
		checkChain: true,
	});
}

describe("createPkpass", () => {
	let testCertificates: Awaited<ReturnType<typeof createTestCertificates>>;
	let files: Record<string, Uint8Array<ArrayBuffer>>;

	beforeAll(async () => {
		pkijs.setEngine(
			"workerd",
			new pkijs.CryptoEngine({ name: "workerd", crypto }),
		);
		testCertificates = await createTestCertificates();

		const pkpass = createPkpass({
			passJson: buildApplePassJson(passInput, passOptions),
			images: { "icon.png": PNG, "icon@2x.png": PNG, "logo.png": PNG },
			certificates: testCertificates.certificates,
		});
		files = Object.fromEntries(
			Object.entries(unzipSync(pkpass)).map(([name, content]) => [
				name,
				new Uint8Array(content),
			]),
		);
	});

	it("contains the pass, its images, the manifest and the signature", () => {
		expect(Object.keys(files).sort()).toEqual(
			[
				"icon.png",
				"icon@2x.png",
				"logo.png",
				"manifest.json",
				"pass.json",
				"signature",
			].sort(),
		);
	});

	it("lists the SHA-1 of every other file in the manifest", async () => {
		const manifest: Record<string, string> = JSON.parse(
			new TextDecoder().decode(files["manifest.json"]),
		);
		const signedFiles = Object.keys(files).filter(
			(name) => name !== "manifest.json" && name !== "signature",
		);

		expect(Object.keys(manifest).sort()).toEqual(signedFiles.sort());
		for (const name of signedFiles) {
			expect(manifest[name], name).toBe(await sha1Hex(files[name]));
		}
	});

	it("writes a valid pass.json built from the input", () => {
		const passJson = applePassJsonSchema.parse(
			JSON.parse(new TextDecoder().decode(files["pass.json"])),
		);

		expect(passJson).toMatchObject({
			passTypeIdentifier: passOptions.passTypeId,
			teamIdentifier: passOptions.teamId,
			webServiceURL: passOptions.webServiceUrl,
			serialNumber: passInput.pass.serialNumber,
			authenticationToken: passInput.pass.authenticationToken,
			organizationName: passInput.program.name,
			backgroundColor: "rgb(29, 79, 215)",
			foregroundColor: "rgb(255, 255, 255)",
			barcodes: [
				{ format: "PKBarcodeFormatQR", message: passInput.pass.serialNumber },
			],
		});
		expect(passJson.storeCard.primaryFields[0]).toMatchObject({
			key: "points",
			value: 120,
		});
		expect(passJson.storeCard.secondaryFields[0]).toMatchObject({
			key: "member",
			value: "Ada Lovelace",
		});
	});

	it("signs the manifest with the signer certificate, chained to the WWDR certificate", async () => {
		await expect(
			verifySignature(
				files.signature,
				files["manifest.json"],
				testCertificates.authority,
			),
		).resolves.toBe(true);

		const signedData = new pkijs.SignedData({
			schema: pkijs.ContentInfo.fromBER(files.signature).content,
		});
		// Wallet requires both certificates in the signature and a signing time.
		expect(signedData.certificates).toHaveLength(2);
		expect(
			signedData.signerInfos[0].signedAttrs?.attributes.map(
				(attribute) => attribute.type,
			),
		).toContain(OID.signingTime);
		// Detached signature: the manifest itself is not embedded.
		expect(signedData.encapContentInfo.eContent).toBeUndefined();
	});

	it("rejects a manifest that does not match the signature", async () => {
		const tampered = new TextEncoder().encode(
			new TextDecoder()
				.decode(files["manifest.json"])
				.replace(/"[0-9a-f]{40}"/, `"${"0".repeat(40)}"`),
		);

		await expect(
			verifySignature(files.signature, tampered, testCertificates.authority),
		).rejects.toThrow();
	});
});
