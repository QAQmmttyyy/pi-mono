import { SessionProvider, useSession } from "./SessionContext.js";
import { Sidebar } from "./components/Sidebar.js";
import { ChatView } from "./components/ChatView.js";
import { CreateSessionDialog } from "./components/CreateSessionDialog.js";
import { RenameSessionDialog } from "./components/RenameSessionDialog.js";
import { DeleteSessionDialog } from "./components/DeleteSessionDialog.js";
import { useState } from "react";

export function App() {
	return (
		<SessionProvider>
			<AppLayout />
		</SessionProvider>
	);
}

function AppLayout() {
	const { activeSessionId, createAndAttach } = useSession();
	const [showCreate, setShowCreate] = useState(false);
	const [renameTarget, setRenameTarget] = useState<string | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

	const handleCreateDirect = async (cwd: string) => {
		await createAndAttach(cwd);
	};

	return (
		<div className="flex h-screen">
			<Sidebar
				onCreate={() => setShowCreate(true)}
				onCreateDirect={handleCreateDirect}
				onRename={setRenameTarget}
				onDelete={setDeleteTarget}
			/>
			<main className="flex-1 flex flex-col min-w-0">
				{activeSessionId ? <ChatView /> : <EmptyState />}
			</main>
			<CreateSessionDialog
				open={showCreate}
				onOpenChange={setShowCreate}
			/>
			<RenameSessionDialog sessionId={renameTarget} onClose={() => setRenameTarget(null)} />
			<DeleteSessionDialog sessionId={deleteTarget} onClose={() => setDeleteTarget(null)} />
		</div>
	);
}

function EmptyState() {
	return (
		<div className="flex-1 flex items-center justify-center">
			<div className="text-center space-y-3">
				<div className="text-muted-foreground">
					<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mx-auto">
						<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
					</svg>
				</div>
				<div className="text-lg font-medium">pi Agent UI</div>
				<div className="text-sm text-muted-foreground">
					Create or select a session to start
				</div>
			</div>
		</div>
	);
}