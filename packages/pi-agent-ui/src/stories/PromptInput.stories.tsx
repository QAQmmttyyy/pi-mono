import type { Meta, StoryObj } from "@storybook/react";
import {
	PromptInput,
	PromptInputTextarea,
	PromptInputActions,
	PromptInputAction,
} from "../components/ui/prompt-input.js";
import { Zap } from "lucide-react";

// Fake selectors for standalone rendering without session context
function FakeModelSelector() {
	const label = "DeepSeek: DeepSeek V4 Pro";
	return (
		<button
			type="button"
			className="flex items-center gap-1.5 h-8 px-1.5 min-w-0 overflow-hidden border rounded-md bg-background text-xs"
		>
			<span className="truncate">{label}</span>
			<span className="h-3 w-3 text-muted-foreground shrink-0">▾</span>
		</button>
	);
}

function FakeThinkingSelector() {
	const level = "Medium";
	return (
		<button
			type="button"
			className="flex items-center gap-1 h-8 px-1.5 min-w-0 overflow-hidden border rounded-md bg-background text-xs"
		>
			<span className="truncate">{level}</span>
			<span className="h-3 w-3 text-muted-foreground shrink-0">▾</span>
		</button>
	);
}

const widths = [
	{ label: "Wide (600px)", w: 600 },
	{ label: "Narrow (400px)", w: 400 },
	{ label: "Mobile (320px)", w: 320 },
] as const;

function ResponsiveLayout() {
	return (
		<div className="space-y-6">
			{widths.map(({ label, w }) => (
				<div key={w} className="space-y-1">
					<span className="text-xs text-muted-foreground">
						{label}
					</span>
					<div className="overflow-x-auto border bg-muted/50 rounded-lg p-4">
						<div style={{ width: w }} className="border bg-background rounded-lg">
							<PromptInput>
								<PromptInputTextarea placeholder="Send a message..." />
								<PromptInputActions>
									<FakeModelSelector />
									<FakeThinkingSelector />
									<div className="flex-1 min-w-2" />
									<PromptInputAction tooltip="Send">
										<button type="button" className="p-1">
											<Zap className="h-4 w-4" />
										</button>
									</PromptInputAction>
								</PromptInputActions>
							</PromptInput>
						</div>
					</div>
				</div>
			))}
		</div>
	);
}

const meta: Meta<typeof PromptInput> = {
	title: "Components/PromptInput",
	component: PromptInput,
	parameters: { layout: "padded" },
	tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof PromptInput>;

export const ResponsiveWidth: StoryObj = {
	render: () => <ResponsiveLayout />,
};
