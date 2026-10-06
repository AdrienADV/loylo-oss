import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

// Server functions are same-origin RPC endpoints: reject cross-site calls.
// Server routes are left out, since Apple and Google call the wallet ones.
const csrfMiddleware = createCsrfMiddleware({
	filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
	requestMiddleware: [csrfMiddleware],
}));
