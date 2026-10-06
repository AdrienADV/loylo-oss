/** Plain-text response, for server routes that browsers open directly. */
export function textResponse(status: number, message: string): Response {
	return new Response(message, {
		status,
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
}

/**
 * Parses a JSON request body of at most `maxBytes`. Returns `undefined` when
 * the body is too large or not JSON.
 */
export async function readJsonBody(
	request: Request,
	maxBytes: number,
): Promise<unknown> {
	const declaredLength = Number(request.headers.get("content-length"));
	if (declaredLength > maxBytes) {
		return undefined;
	}
	const text = await request.text();
	if (new TextEncoder().encode(text).length > maxBytes) {
		return undefined;
	}
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return undefined;
	}
}
