import { forwardRef } from "react";
import { cn } from "../utils/cn.js";
import { formatRelativeTime } from "../utils/format-date.js";
import { Badge } from "./ui/badge.js";
import type { SessionInfo } from "../client/types.js";

interface SessionItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	session: SessionInfo;
	isActive: boolean;
}

export const SessionItem = forwardRef<HTMLButtonElement, SessionItemProps>(
	function SessionItem({ session, isActive, className, ...props }, ref) {
		const label = session.name || session.firstMessage || "Untitled";
		const age = formatRelativeTime(new Date(session.lastModified));

		return (
			<button
				ref={ref}
				className={cn(
					"w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors text-left",
					isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
					className,
				)}
				{...props}
			>
				<span className="truncate">{label}</span>
				<span className="flex items-center gap-1.5 ml-2 shrink-0 text-xs text-muted-foreground">
					{session.messageCount > 0 && (
						<Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
							{session.messageCount}
						</Badge>
					)}
					<span className="tabular-nums">{age}</span>
				</span>
			</button>
		);
	},
);
SessionItem.displayName = "SessionItem";