import type { Meta, StoryObj } from "@storybook/react";
import { MessageBubble } from "../components/MessageBubble";

const meta: Meta<typeof MessageBubble> = {
	title: "Components/MessageBubble",
	component: MessageBubble,
	tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof MessageBubble>;

export const UserMessage: Story = {
	args: {
		msg: {
			id: "1",
			role: "user",
			content: "Help me refactor this function",
			timestamp: Date.now(),
		},
	},
};

export const AssistantText: Story = {
	args: {
		msg: {
			id: "2",
			role: "assistant",
			content: "Sure, let me help you with that. Here's a refactored version:\n\n```typescript\nfunction greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n```",
			thinking: undefined,
			tools: [],
			stopReason: "stop",
			timestamp: Date.now(),
		},
	},
};

export const WithThinking: Story = {
	args: {
		msg: {
			id: "3",
			role: "assistant",
			content: "The answer is 42.",
			thinking: "Let me think about this step by step.\n\nThe user is asking about the meaning of life.\n\nI should provide a concise answer.",
			tools: [],
			stopReason: "stop",
			timestamp: Date.now(),
		},
	},
};

export const WithToolCalls: Story = {
	args: {
		msg: {
			id: "4",
			role: "assistant",
			content: "Let me check the file first.",
			thinking: "I need to read the current file content.",
			tools: [
				{ id: "t1", title: "read", label: "src/App.tsx", status: "completed", toolOutput: 'export function App() {\n  return <div>Hello</div>;\n}' },
				{ id: "t2", title: "edit", label: "src/App.tsx (1 edit)", status: "completed", toolOutput: "@@ -1,3 +1,4 @@\n export function App() {\n+  const name = 'World';\n   return <div>Hello</div>;\n }" },
			],
			stopReason: "stop",
			timestamp: Date.now(),
		},
	},
};

export const StopReasonError: Story = {
	args: {
		msg: {
			id: "5",
			role: "assistant",
			content: "",
			tools: [],
			stopReason: "error",
			errorMessage: "Rate limit exceeded. Please try again later.",
			timestamp: Date.now(),
		},
	},
};

export const StopReasonAborted: Story = {
	args: {
		msg: {
			id: "6",
			role: "assistant",
			content: "Here is some partial text that was can...",
			tools: [],
			stopReason: "aborted",
			timestamp: Date.now(),
		},
	},
};

export const StopReasonLength: Story = {
	args: {
		msg: {
			id: "7",
			role: "assistant",
			content: "This is a very long response that was truncated due to the token limit...",
			tools: [],
			stopReason: "length",
			timestamp: Date.now(),
		},
	},
};

export const SystemInfo: Story = {
	args: {
		msg: {
			id: "8",
			role: "system",
			content: "Compaction complete",
			level: "info",
			timestamp: Date.now(),
		},
	},
};

export const SystemError: Story = {
	args: {
		msg: {
			id: "9",
			role: "system",
			content: "Retry failed: Connection timeout",
			level: "error",
			timestamp: Date.now(),
		},
	},
};
