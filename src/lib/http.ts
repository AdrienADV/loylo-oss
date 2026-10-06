/** Plain-text response, for server routes that browsers open directly. */
export function textResponse(status: number, message: string): Response {
	return new Response(message, {
		status,
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
}
