import { Button } from "./ui/button.js";
import { Folder, Plus } from "lucide-react";

interface SessionGroupProps {
	cwd: string;
	onCreate?: () => void;
	children?: React.ReactNode;
}

export function SessionGroup({ cwd, onCreate, children }: SessionGroupProps) {
	const dirName = cwd.split("/").pop() || cwd;

	return (
		<div className="mb-3">
			<div className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground">
				<Folder className="h-3 w-3 shrink-0" />
				<span className="truncate">{dirName}</span>
				<Button
					variant="ghost"
					size="icon"
					className="ml-auto h-5 w-5 shrink-0"
					onClick={onCreate}
				>
					<Plus className="h-3 w-3" />
				</Button>
			</div>
			<div className="pl-5 space-y-0.5">
				{children}
			</div>
		</div>
	);
}