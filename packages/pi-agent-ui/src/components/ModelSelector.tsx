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
import { ChevronsUpDown } from "lucide-react";

export function ModelSelector() {
	const { state, sendCommand, availableModels, loadModels } = useSession();
	const currentModel = state?.model;
	const label = currentModel?.name ?? "Select model";

	return (
		<Popover onOpenChange={(open) => { if (open) loadModels(); }}>
			<PopoverTrigger asChild>
				<Button variant="outline" size="sm" className="gap-1.5 h-8">
					<span className="truncate">{label}</span>
					<ChevronsUpDown className="h-3 w-3 text-muted-foreground shrink-0" />
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
