import type { Meta, StoryObj } from "@storybook/react";
import { SessionGroup } from "../components/SessionGroup";
import { SessionItem } from "../components/SessionItem";
import type { SessionInfo } from "../client/types";

const meta: Meta<typeof SessionGroup> = {
	title: "Components/SessionGroup",
	component: SessionGroup,
	tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof SessionGroup>;

function makeSession(id: string, name: string, messageCount: number, minutesAgo: number): SessionInfo {
	return {
		id,
		cwd: "/Users/tianyu/pi-agent-server-workspace",
		name,
		lastModified: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
		messageCount,
		firstMessage: "",
		isActive: false,
		subscriberCount: 0,
	};
}

export const Default: Story = {
	args: {
		cwd: "/Users/tianyu/pi-agent-server-workspace",
	},
	render: (args) => (
		<SessionGroup {...args}>
			<SessionItem session={makeSession("1", "Fix login redirect", 5, 30)} isActive={false} onClick={() => {}} />
			<SessionItem session={makeSession("2", "Refactor auth module", 12, 120)} isActive={false} onClick={() => {}} />
			<SessionItem session={makeSession("3", "Setup CI pipeline", 3, 1440)} isActive={false} onClick={() => {}} />
		</SessionGroup>
	),
};

export const EmptyGroup: Story = {
	args: {
		cwd: "/Users/tianyu/projects/new-project",
	},
};

export const WithActiveSession: Story = {
	args: {
		cwd: "/Users/tianyu/pi-agent-server-workspace",
	},
	render: (args) => (
		<SessionGroup {...args}>
			<SessionItem session={makeSession("1", "Active conversation", 8, 5)} isActive={true} onClick={() => {}} />
			<SessionItem session={makeSession("2", "Previous conversation", 15, 60)} isActive={false} onClick={() => {}} />
		</SessionGroup>
	),
};

export const DeepNestedCwd: Story = {
	args: {
		cwd: "/Users/tianyu/Mty/projects/OpenSourceProject/very/deeply/nested/my-project",
	},
	render: (args) => (
		<SessionGroup {...args}>
			<SessionItem session={makeSession("1", "Deep nested session", 2, 10)} isActive={false} onClick={() => {}} />
		</SessionGroup>
	),
};