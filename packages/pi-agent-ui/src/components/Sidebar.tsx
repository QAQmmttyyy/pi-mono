import { useSession } from "../SessionContext.js";
import { cn } from "../utils/cn.js";
import { Button } from "./ui/button.js";
import { ScrollArea } from "./ui/scroll-area.js";
import { Badge } from "./ui/badge.js";
import { Separator } from "./ui/separator.js";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "./ui/context-menu.js";
import { ThemeToggle } from "./ThemeToggle.js";
import { Plus, Pencil, Trash2, Folder } from "lucide-react";

interface SidebarProps {
	onCreate: () => void;
	onCreateDirect: (cwd: string) => void;
	onRename: (id: string) => void;
	onDelete: (id: string) => void;
}

export function Sidebar({ onCreate, onCreateDirect, onRename, onDelete }: SidebarProps) {
	const { sessions, activeSessionId, attachToSession } = useSession();

	// Group sessions by cwd (parent directory)
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
			<div className="p-3 space-y-2">
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
						<div key={cwd} className="mb-3">
							<div className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground">
								<Folder className="h-3 w-3 shrink-0" />
								<span className="truncate">{cwd.split("/").pop() || cwd}</span>
								<Button
									variant="ghost"
									size="icon"
									className="ml-auto h-5 w-5 shrink-0"
									onClick={() => onCreateDirect(cwd)}
								>
									<Plus className="h-3 w-3" />
								</Button>
							</div>
							<div className="pl-5 space-y-0.5">
								{items.map((s) => (
									<ContextMenu key={s.id}>
										<ContextMenuTrigger asChild>
											<button
												className={cn(
													"w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors text-left",
													activeSessionId === s.id
														? "bg-accent text-accent-foreground"
														: "hover:bg-accent/50",
												)}
												onClick={() => attachToSession(s.id)}
											>
												<span className="truncate">{s.name || s.firstMessage || "Untitled"}</span>
												{s.messageCount > 0 && (
													<Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0 h-4 shrink-0">
														{s.messageCount}
													</Badge>
												)}
											</button>
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
							</div>
						</div>
					))}
				</div>
			</ScrollArea>

		</aside>
	);
}
