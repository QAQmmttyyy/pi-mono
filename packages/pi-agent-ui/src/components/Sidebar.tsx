import { useSession } from "../SessionContext.js";
import { Button } from "./ui/button.js";
import { ScrollArea } from "./ui/scroll-area.js";
import { Separator } from "./ui/separator.js";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "./ui/context-menu.js";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle.js";
import { SessionGroup } from "./SessionGroup.js";
import { SessionItem } from "./SessionItem.js";

interface SidebarProps {
	onCreate: () => void;
	onCreateDirect: (cwd: string) => void;
	onRename: (id: string) => void;
	onDelete: (id: string) => void;
}

export function Sidebar({ onCreate, onCreateDirect, onRename, onDelete }: SidebarProps) {
	const { sessions, activeSessionId, attachToSession } = useSession();

	// Group sessions by cwd
	const groups = new Map<string, typeof sessions>();
	for (const s of sessions) {
		const dir = s.cwd || "Root";
		const existing = groups.get(dir);
		if (existing) existing.push(s);
		else groups.set(dir, [s]);
	}

	return (
		<aside className="w-64 border-r flex flex-col shrink-0">
			<div className="flex items-center justify-between px-3 py-2.5 border-b">
				<span className="font-semibold text-sm tracking-tight">pi</span>
				<ThemeToggle />
			</div>
			<div className="p-3">
				<Button className="w-full" onClick={onCreate}>
					<Plus className="h-4 w-4" />
					New Session
				</Button>
			</div>
			<Separator />
			<ScrollArea className="flex-1">
				<div className="p-2">
					{groups.size === 0 && (
						<div className="px-3 py-8 text-sm text-muted-foreground text-center">
							No sessions yet
						</div>
					)}
					{[...groups.entries()].map(([cwd, items]) => (
						<SessionGroup
							key={cwd}
							cwd={cwd}
							onCreate={() => onCreateDirect(cwd)}
						>
							{items.map((s) => (
								<ContextMenu key={s.id}>
									<ContextMenuTrigger asChild>
										<SessionItem
											session={s}
											isActive={activeSessionId === s.id}
											onClick={() => attachToSession(s.id)}
										/>
									</ContextMenuTrigger>
									<ContextMenuContent className="w-40">
										<ContextMenuItem onClick={() => onRename(s.id)}>
											<Pencil className="h-4 w-4 mr-2" />
											Rename
										</ContextMenuItem>
										<ContextMenuItem
											className="text-destructive focus:text-destructive"
											onClick={() => onDelete(s.id)}
										>
											<Trash2 className="h-4 w-4 mr-2" />
											Delete
										</ContextMenuItem>
									</ContextMenuContent>
								</ContextMenu>
							))}
						</SessionGroup>
					))}
				</div>
			</ScrollArea>
		</aside>
	);
}