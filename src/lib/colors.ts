import { z } from "zod";

export const hexColorSchema = z
	.string()
	.regex(/^#[0-9a-fA-F]{6}$/, "Expected a color like #1d4fd7")
	.transform((color) => color.toLowerCase());

export type HexColor = z.output<typeof hexColorSchema>;

interface Rgb {
	r: number;
	g: number;
	b: number;
}

export function hexToRgb(color: HexColor): Rgb {
	const value = Number.parseInt(color.slice(1), 16);
	return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

/** Formats a color the way Apple Wallet expects it in `pass.json`. */
export function toCssRgb(color: HexColor): string {
	const { r, g, b } = hexToRgb(color);
	return `rgb(${r}, ${g}, ${b})`;
}

/** Picks black or white text, whichever reads best on the given background (WCAG luminance). */
export function pickForegroundColor(background: HexColor): HexColor {
	const { r, g, b } = hexToRgb(background);
	const [lr, lg, lb] = [r, g, b].map((channel) => {
		const c = channel / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	const luminance = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
	// Contrast against white equals contrast against black at luminance ≈ 0.179.
	return luminance > 0.179 ? "#000000" : "#ffffff";
}
