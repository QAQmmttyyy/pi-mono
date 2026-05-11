import { useState } from "react";
import type { DisplayTool } from "../client/types.js";
import { cn } from "../utils/cn.js";
import { Loader2, Check, X } from "lucide-react";

interface Props {
	step: DisplayTool;
}

export function ToolCard({ step }: Props) {
	const isRunning = step.status === "active";
	const [userExpanded, setUserExpanded] = useState<boolean | null>(null);
	// null = no user preference, auto-expand while running
	// once user clicks, follow their choice
	const expanded = userExpanded ?? isRunning;

	return (
		<div className="text-xs border border-border rounded-md overflow-hidden">
			<button
				className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted/50 transition-colors text-left"
				onClick={() => setUserExpanded(!userExpanded)}
				title={step.label}
			>
				<ToolStatusIcon status={step.status} />
				<span className="font-mono font-medium shrink-0">{step.title}</span>
				<span className="text-muted-foreground truncate">{step.label}</span>
			</button>

			{expanded && step.toolOutput && (
				<div className={cn(
					"border-t border-border px-2.5 py-1.5 font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto",
					step.toolIsError ? "text-destructive" : "text-foreground",
				)}>
					{step.toolOutput}
				</div>
			)}
		</div>
	);
}

function ToolStatusIcon({ status }: { status: DisplayTool["status"] }) {
	switch (status) {
		case "active":
			return <Loader2 className="w-3 h-3 text-blue-500 animate-spin shrink-0" />;
		case "completed":
			return <Check className="w-3 h-3 text-green-500 shrink-0" />;
		case "error":
			return <X className="w-3 h-3 text-destructive shrink-0" />;
	}
}
