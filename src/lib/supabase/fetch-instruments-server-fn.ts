import { createServerFn } from "@tanstack/react-start";

import { createClient } from "#/lib/supabase/server";

export const fetchInstruments = createServerFn({ method: "GET" }).handler(
	async () => {
		const supabase = createClient();
		const { data: instruments, error } = await supabase
			.from("instruments")
			.select();

		if (error) {
			console.error(error);
			return { instruments: [], error: error.message };
		}

		return { instruments, error: null };
	},
);
