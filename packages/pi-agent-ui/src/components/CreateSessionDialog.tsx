import { useState } from "react";
import { useSession } from "../SessionContext.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog.js";
import { Input } from "./ui/input.js";
import { Button } from "./ui/button.js";
import { Field, FieldLabel, FieldError } from "./ui/field.js";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

const DEFAULT_WORKSPACE = "~/pi-agent-server-workspace";

export function CreateSessionDialog({ open, onOpenChange }: Props) {
	const { client, loadSessions, attachToSession } = useSession();
	const [cwd, setCwd] = useState("");
	const [error, setError] = useState("");

	const handleCreate = async () => {
		setError("");
		try {
			const info = await client.createSession(cwd || undefined);
			await loadSessions();
			await attachToSession(info.id);
			onOpenChange(false);
			setCwd("");
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>New Session</DialogTitle>
				</DialogHeader>
				<Field>
					<FieldLabel htmlFor="session-cwd">
						Working directory <span className="text-muted-foreground font-normal">(optional)</span>
					</FieldLabel>
					<Input
						id="session-cwd"
						placeholder={DEFAULT_WORKSPACE}
						value={cwd}
						onChange={(e) => { setCwd(e.target.value); setError(""); }}
						onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
						autoFocus
						aria-invalid={!!error}
						data-error={error || undefined}
					/>
					<FieldError>{error || undefined}</FieldError>
				</Field>
				<Button className="w-full mt-4" onClick={handleCreate}>Create</Button>
			</DialogContent>
		</Dialog>
	);
}