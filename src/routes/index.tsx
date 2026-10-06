import { createFileRoute } from "@tanstack/react-router";

import { fetchInstruments } from "#/lib/supabase/fetch-instruments-server-fn";

export const Route = createFileRoute("/")({
	loader: async () => fetchInstruments(),
	component: Home,
});

function Home() {
	const { instruments, error } = Route.useLoaderData();

	if (error) {
		return <p>Error loading instruments: {error}</p>;
	}

	return (
		<ul>
			{instruments?.map((instrument) => (
				<li key={instrument.id}>{instrument.name}</li>
			))}
		</ul>
	);
}
