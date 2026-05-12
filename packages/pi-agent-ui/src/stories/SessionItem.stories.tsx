import type { Meta, StoryObj } from "@storybook/react";
import { SessionItem } from "../components/SessionItem";

const meta: Meta<typeof SessionItem> = {
	title: "Components/SessionItem",
	component: SessionItem,
	tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof SessionItem>;

const baseSession = {
	id: "1",
	cwd: "/Users/tianyu/pi-agent-server-workspace",
	messageCount: 5,
	firstMessage: "",
	isActive: false,
	subscriberCount: 0,
};

export const WithName: Story = {
	args: {
		session: {
			...baseSession,
			name: "Fix login bug",
			lastModified: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
		},
		isActive: false,
	},
};

export const Active: Story = {
	args: {
		session: {
			...baseSession,
			name: "Refactor auth module",
			lastModified: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
		},
		isActive: true,
	},
};

export const FallbackFirstMessage: Story = {
	args: {
		session: {
			...baseSession,
			name: undefined,
			firstMessage: "Help me fix the login redirect issue",
			lastModified: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
		},
		isActive: false,
	},
};

export const Untitled: Story = {
	args: {
		session: {
			...baseSession,
			name: undefined,
			firstMessage: "",
			messageCount: 0,
			lastModified: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
		},
		isActive: false,
	},
};

export const ZeroMessages: Story = {
	args: {
		session: {
			...baseSession,
			name: "New empty session",
			messageCount: 0,
			lastModified: new Date().toISOString(),
		},
		isActive: false,
	},
};

export const OlderSession: Story = {
	args: {
		session: {
			...baseSession,
			name: "Old project setup",
			messageCount: 42,
			lastModified: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
		},
		isActive: false,
	},
};

export const LongName: Story = {
	args: {
		session: {
			...baseSession,
			name: "This is an extremely long session name that should be truncated with an ellipsis in the sidebar",
			messageCount: 128,
			lastModified: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
		},
		isActive: false,
	},
};