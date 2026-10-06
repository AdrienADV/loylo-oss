import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { getCurrentUser } from "#/features/auth/auth.functions";

/** Pages for signed-out visitors: signed-in users go to their dashboard. */
export const Route = createFileRoute("/_guest")({
	beforeLoad: async () => {
		if (await getCurrentUser()) {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: GuestLayout,
});

function GuestLayout() {
	return (
		<main className="flex min-h-svh items-center justify-center p-6">
			<Outlet />
		</main>
	);
}
