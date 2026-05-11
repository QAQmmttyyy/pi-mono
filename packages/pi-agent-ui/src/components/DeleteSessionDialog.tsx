import { useSession } from "../SessionContext.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog.js";
import { Button } from "./ui/button.js";

interface Props {
	sessionId: string | null;
	onClose: () => void;
}

export function DeleteSessionDialog({ sessionId, onClose }: Props) {
	const { deleteSession, sessions } = useSession();
	const name = sessionId ? (sessions.find((s) => s.id === sessionId)?.name || "Untitled") : "";

	const handleDelete = async () => {
		if (!sessionId) return;
		await deleteSession(sessionId);
		onClose();
	};

	return (
		<Dialog open={!!sessionId} onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Delete Session</DialogTitle>
				</DialogHeader>
				<div className="space-y-3 pt-2">
					<p className="text-sm text-muted-foreground">
						Are you sure you want to delete &quot;{name}&quot;? This cannot be undone.
					</p>
					<div className="flex gap-2 justify-end">
						<Button variant="outline" onClick={onClose}>Cancel</Button>
						<Button variant="destructive" onClick={handleDelete}>Delete</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
