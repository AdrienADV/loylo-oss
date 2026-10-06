import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { ProgramForm } from "#/features/programs/components/program-form";
import { createProgram } from "#/features/programs/programs.functions";

export const Route = createFileRoute("/_authed/programs/new")({
	component: NewProgramPage,
});

function NewProgramPage() {
	const navigate = useNavigate();
	const createProgramFn = useServerFn(createProgram);

	return (
		<section className="flex flex-col gap-6">
			<div>
				<h1 className="font-semibold text-2xl">New loyalty program</h1>
				<p className="text-muted-foreground">
					Design the card your customers add to their wallet.
				</p>
			</div>
			<ProgramForm
				submitLabel="Create the program"
				pendingLabel="Creating…"
				onSubmit={async (formData) => {
					const { programId, googleWallet } = await createProgramFn({
						data: formData,
					});
					await navigate({
						to: "/programs/$programId",
						params: { programId },
						search: googleWallet === "failed" ? { walletSync: "failed" } : {},
					});
				}}
			/>
		</section>
	);
}
