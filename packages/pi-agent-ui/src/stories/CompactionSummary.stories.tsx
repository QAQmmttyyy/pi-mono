import type { Meta, StoryObj } from "@storybook/react";
import { CompactionSummary } from "../components/CompactionSummary";

const meta: Meta<typeof CompactionSummary> = {
	title: "Components/CompactionSummary",
	component: CompactionSummary,
	parameters: { layout: "padded" },
	tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof CompactionSummary>;

export const Default: Story = {
	args: {
		summary:
			"The user asked about setting up a React project with Vite. The assistant suggested using create-vite, installing dependencies, and configuring Tailwind CSS. They discussed project structure options and settled on using TypeScript with React Router.",
		tokensBefore: 15420,
	},
};

export const Expanded: Story = {
	args: {
		summary:
			"The conversation covered the following key topics:\n\n" +
			"## Architecture Decisions\n\n" +
			"- **SessionPool**: Manages active `AgentSession` instances with lazy loading from JSONL files\n" +
			"- **Idle unloading**: Sessions unload after 30 min of inactivity to free memory\n" +
			"- **Event broadcasting**: All `AgentSessionEvent`s are forwarded to WebSocket subscribers\n\n" +
			"## API Design\n\n" +
			"```\n" +
			"GET    /api/sessions          - list all sessions\n" +
			"POST   /api/sessions          - create a new session\n" +
			"GET    /api/sessions/:id      - get session detail\n" +
			"DELETE /api/sessions/:id      - delete session\n" +
			"PATCH  /api/sessions/:id/name - rename session\n" +
			"```\n\n" +
			"## Follow-up Discussion\n\n" +
			"The next round covered deployment strategies, environment configuration, and CI/CD pipeline setup across multiple environments.\n\n".repeat(8) +
			"--- End of summary ---",
		tokensBefore: 45300,
	},
	play: ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const button = canvasElement.querySelector("button");
		if (button) button.click();
	},
};

export const MinimalSummary: Story = {
	args: {
		summary: "Short conversation about environment setup.",
		tokensBefore: 5201,
	},
};