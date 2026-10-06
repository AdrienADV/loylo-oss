import { Link } from "@tanstack/react-router";

import type { ProgramView } from "#/features/programs/programs.server";
import { pickForegroundColor } from "#/lib/colors";

export function ProgramCard({ program }: { program: ProgramView }) {
	return (
		<Link
			to="/programs/$programId"
			params={{ programId: program.id }}
			className="flex items-center gap-3 rounded-2xl p-4 shadow-sm transition-transform hover:-translate-y-0.5"
			style={{
				backgroundColor: program.backgroundColor,
				color: pickForegroundColor(program.backgroundColor),
			}}
		>
			{program.logoUrl ? (
				<img
					src={program.logoUrl}
					alt=""
					className="h-8 max-w-24 object-contain"
				/>
			) : null}
			<span className="truncate font-semibold">{program.name}</span>
		</Link>
	);
}
