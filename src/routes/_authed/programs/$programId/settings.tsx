import {
	createFileRoute,
	getRouteApi,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ProgramForm } from "#/features/programs/components/program-form";
import {
	deleteProgram,
	updateProgram,
} from "#/features/programs/programs.functions";
import { FormAlert } from "@/components/form-alert";
import { Button } from "@/components/ui/button";

const programRoute = getRouteApi("/_authed/programs/$programId");

export const Route = createFileRoute("/_authed/programs/$programId/settings")({
	component: ProgramSettingsPage,
});

function ProgramSettingsPage() {
	const program = programRoute.useLoaderData();
	const router = useRouter();
	const updateProgramFn = useServerFn(updateProgram);
	const [notice, setNotice] = useState<string | null>(null);

	return (
		<div className="flex flex-col gap-10">
			<div className="flex flex-col gap-4">
				<FormAlert tone="success">{notice}</FormAlert>
				<ProgramForm
					key={program.id}
					initialValues={program}
					submitLabel="Save changes"
					pendingLabel="Saving…"
					onSubmit={async (formData) => {
						formData.set("programId", program.id);
						const { googleWallet } = await updateProgramFn({ data: formData });
						await router.invalidate();
						setNotice(
							googleWallet === "failed"
								? "Changes saved, but Google Wallet could not be updated. Save again to retry."
								: "Changes saved.",
						);
					}}
				/>
			</div>
			<DeleteProgram programId={program.id} programName={program.name} />
		</div>
	);
}

function DeleteProgram({
	programId,
	programName,
}: {
	programId: string;
	programName: string;
}) {
	const navigate = useNavigate();
	const deleteProgramFn = useServerFn(deleteProgram);
	const [confirming, setConfirming] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleDelete() {
		setPending(true);
		setError(null);
		try {
			await deleteProgramFn({ data: { programId } });
			await navigate({ to: "/dashboard" });
		} catch (deleteError) {
			setError(
				deleteError instanceof Error
					? deleteError.message
					: "Could not delete.",
			);
			setPending(false);
		}
	}

	return (
		<section className="flex flex-col gap-3 rounded-2xl border border-destructive/30 p-4">
			<h2 className="font-semibold">Delete this program</h2>
			<p className="text-muted-foreground text-sm">
				Its card can no longer be added to a wallet. This cannot be undone.
			</p>
			<FormAlert>{error}</FormAlert>
			{confirming ? (
				<div className="flex flex-wrap gap-2">
					<Button
						variant="destructive"
						disabled={pending}
						onClick={handleDelete}
					>
						{pending ? "Deleting…" : `Delete ${programName}`}
					</Button>
					<Button
						variant="outline"
						disabled={pending}
						onClick={() => setConfirming(false)}
					>
						Cancel
					</Button>
				</div>
			) : (
				<Button
					variant="outline"
					className="self-start"
					onClick={() => setConfirming(true)}
				>
					Delete the program
				</Button>
			)}
		</section>
	);
}
