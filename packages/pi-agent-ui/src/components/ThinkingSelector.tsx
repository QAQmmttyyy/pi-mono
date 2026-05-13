import { useMemo } from "react";
import { getSupportedThinkingLevels } from "@mariozechner/pi-ai";
import { useSession } from "../SessionContext.js";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select.js";

const LEVEL_LABELS: Record<string, string> = {
	off: "Off",
	minimal: "Minimal",
	low: "Low",
	medium: "Medium",
	high: "High",
	xhigh: "X-High",
};

export function ThinkingSelector() {
	const { state, sendCommand } = useSession();
	const model = state?.model;

	const levels = useMemo(() => {
		if (!model) return ["off"];
		return getSupportedThinkingLevels(model as Parameters<typeof getSupportedThinkingLevels>[0]);
	}, [model]);

	const current = state?.thinkingLevel || "off";

	return (
		<Select value={current} onValueChange={(level) => sendCommand({ type: "set_thinking_level", level })}>
			<SelectTrigger className="h-8 gap-1 px-1.5 min-w-0 overflow-hidden">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{levels.map((level) => (
					<SelectItem key={level} value={level}>
						{LEVEL_LABELS[level] ?? level}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
