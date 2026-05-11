import { useState, useEffect } from "react";
import { useSession } from "../SessionContext.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog.js";
import { Input } from "./ui/input.js";
import { Button } from "./ui/button.js";
import { Field, FieldLabel } from "./ui/field.js";

interface Props {
	sessionId: string | null;
	onClose: () => void;
}

export function RenameSessionDialog({ sessionId, onClose }: Props) {
	const { renameSession, sessions } = useSession();
	const [value, setValue] = useState("");

	useEffect(() => {
		if (sessionId) {
			const s = sessions.find((s) => s.id === sessionId);
			setValue(s?.name || "");
		}
	}, [sessionId, sessions]);

	const handleSave = async () => {
		if (!sessionId || !value.trim()) return;
		await renameSession(sessionId, value.trim());
		onClose();
	};

	return (
		<Dialog open={!!sessionId} onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Rename Session</DialogTitle>
				</DialogHeader>
				<Field>
					<FieldLabel htmlFor="rename-session">Session Name</FieldLabel>
					<Input
						id="rename-session"
						value={value}
						onChange={(e) => setValue(e.target.value)}
						onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
						autoFocus
					/>
				</Field>
				<Button className="w-full mt-3" onClick={handleSave}>Save</Button>
			</DialogContent>
		</Dialog>
	);
}
