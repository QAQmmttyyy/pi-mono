import type { Meta, StoryObj } from "@storybook/react";
import { ToolCard } from "../components/ToolCard";

const meta: Meta<typeof ToolCard> = {
	title: "Components/ToolCard",
	component: ToolCard,
	tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof ToolCard>;

export const BashRun: Story = {
	args: {
		step: {
			id: "1",
			title: "bash",
			label: "ls -la /very/long/path/to/some/directory",
			status: "active",
			toolInput: { command: "ls -la /very/long/path/to/some/directory" },
		},
	},
};

export const BashDone: Story = {
	args: {
		step: {
			id: "2",
			title: "bash",
			label: "ls -la",
			status: "completed",
			toolOutput: "total 24\ndrwxr-xr-x  6 user staff  192 Jan 1 12:00 .\ndrwxr-xr-x 10 user staff  320 Jan 1 12:00 ..\n-rw-r--r--  1 user staff  256 Jan 1 12:00 index.ts",
		},
	},
};

export const BashError: Story = {
	args: {
		step: {
			id: "3",
			title: "bash",
			label: "cat /nonexistent/file",
			status: "error",
			toolOutput: "cat: /nonexistent/file: No such file or directory",
			toolIsError: true,
		},
	},
};

export const ReadDone: Story = {
	args: {
		step: {
			id: "4",
			title: "read",
			label: "src/App.tsx:100-200",
			status: "completed",
			toolOutput: 'import { useState } from "react";\n\nexport function App() {\n  const [count, setCount] = useState(0);\n  return <div>{count}</div>;\n}',
		},
	},
};

export const EditDone: Story = {
	args: {
		step: {
			id: "5",
			title: "edit",
			label: "src/App.tsx (2 edits)",
			status: "completed",
			toolOutput: "@@ -1,3 +1,3 @@\n-const foo = 1;\n+const foo = 2;\n@@ -5,1 +5,1 @@\n-bar();\n+baz();",
		},
	},
};

export const WriteDone: Story = {
	args: {
		step: {
			id: "6",
			title: "write",
			label: "src/new-file.ts",
			status: "completed",
			toolOutput: "File written successfully",
		},
	},
};

export const LongOutput: Story = {
	args: {
		step: {
			id: "7",
			title: "bash",
			label: "npm test",
			status: "completed",
			toolOutput: Array.from({ length: 50 }, (_, i) => `line ${i + 1}: some test output here`).join("\n"),
		},
	},
};
