import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getCurrentUser, signOut } from "#/features/auth/auth.functions";
import { Button } from "@/components/ui/button";

/**
 * Pages for signed-in merchants. This guard only decides what the browser
 * shows; server functions check the session themselves (`authMiddleware`).
 */
export const Route = createFileRoute("/_authed")({
	beforeLoad: async ({ location }) => {
		const user = await getCurrentUser();
		if (!user) {
			throw redirect({ to: "/login", search: { redirect: location.href } });
		}
		return { user };
	},
	component: AuthedLayout,
});

function AuthedLayout() {
	const { user } = Route.useRouteContext();
	const navigate = useNavigate();
	const signOutFn = useServerFn(signOut);

	async function handleSignOut() {
		await signOutFn();
		await navigate({ to: "/login" });
	}

	return (
		<div className="min-h-svh">
			<header className="flex items-center justify-between gap-4 border-b px-6 py-3">
				<Link to="/dashboard" className="font-semibold">
					Loylo
				</Link>
				<div className="flex items-center gap-3 text-sm">
					<span className="text-muted-foreground">{user.email}</span>
					<Button variant="outline" size="sm" onClick={handleSignOut}>
						Sign out
					</Button>
				</div>
			</header>
			<main className="mx-auto max-w-5xl p-6">
				<Outlet />
			</main>
		</div>
	);
}
