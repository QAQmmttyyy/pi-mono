import { useSession } from "../SessionContext.js";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "./ui/popover.js";
import {
	Command,
	CommandInput,
	CommandList,
	CommandEmpty,
	CommandGroup,
	CommandItem,
} from "./ui/command.js";
import { Button } from "./ui/button.js";
import { ChevronDown } from "lucide-react";

export function ModelSelector() {
	const { state, sendCommand, availableModels, loadModels } = useSession();
	const currentModel = state?.model;
	const label = currentModel?.name ?? "Select model";

	return (
		<Popover onOpenChange={(open) => { if (open) loadModels(); }}>
			<PopoverTrigger asChild>
				<Button variant="outline" size="sm" className="gap-1.5 h-8 px-1.5 min-w-0 overflow-hidden">
					<span className="truncate">{label}</span>
					<ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-72 p-0" align="start">
				<Command>
					<CommandInput placeholder="Search model..." />
					<CommandList>
						<CommandEmpty>No models found</CommandEmpty>
						<CommandGroup>
							{availableModels.map((m) => (
								<CommandItem
									key={`${m.provider}/${m.id}`}
									onSelect={() => sendCommand({ type: "set_model", provider: m.provider, modelId: m.id })}
								>
									{m.name ?? `${m.provider}/${m.id}`}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
