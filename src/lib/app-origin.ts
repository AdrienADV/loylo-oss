import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/** Origin the app is served from, to build links customers open on their phones. */
export const getAppOrigin = createIsomorphicFn()
	.server(() => new URL(getRequest().url).origin)
	.client(() => window.location.origin);
