/**
 * Response formatter — formats bot responses for Feishu display.
 *
 * Provides both text and Feishu interactive card formats.
 */

import type { MappedSession } from "./types.js";

/** Format the session list as a text message */
export function formatSessionList(
	sessions: MappedSession[],
	currentSessionId: string | null,
	chatHistory: string[],
): string {
	if (sessions.length === 0) {
		return `📋 你还没有任何会话。发送 "新建会话" 或 /new 创建一个。`;
	}

	const lines: string[] = ["📋 **你的会话列表**\n"];

	for (let i = 0; i < sessions.length; i++) {
		const s = sessions[i];
		const isCurrent = s.id === currentSessionId ? " ◀ 当前" : "";
		const isRecent = chatHistory.includes(s.id) ? " (最近使用)" : "";
		const name = s.name || "(未命名)";
		const firstMsg = s.firstMessage && s.firstMessage !== "(no messages)" ? s.firstMessage.slice(0, 60) : "(空)";
		lines.push(`${i + 1}. **${name}**${isCurrent}${isRecent}`);
		lines.push(`   ${firstMsg}`);
	}

	lines.push("\n💡 输入 `切换 <编号或名称>` 来切换会话，或输入 `新建` 创建新会话");
	return lines.join("\n");
}

/** Format a session list as a compact list (for quick display) */
export function formatSessionListCompact(sessions: MappedSession[]): string {
	if (sessions.length === 0) {
		return "暂无会话。发送 /new 创建一个。";
	}

	const lines = sessions.map((s, i) => {
		const name = s.name || "(未命名)";
		const preview = s.firstMessage && s.firstMessage !== "(no messages)" ? ` — ${s.firstMessage.slice(0, 40)}` : "";
		return `${i + 1}. ${name}${preview}`;
	});

	lines.unshift("📋 会话列表：");
	lines.push("💡 输入 `切换 <编号>` 来选择");
	return lines.join("\n");
}

/** Format a session switch confirmation */
export function formatSessionSwitched(session: MappedSession): string {
	const name = session.name || "(未命名)";
	return `✅ 已切换到会话 **${name}**\n\n继续发消息吧。`;
}

/** Format a new session confirmation */
export function formatSessionCreated(session: MappedSession): string {
	const name = session.name || "(未命名)";
	return `✅ 已创建新会话 **${name}**\n\n你可以开始提问了。`;
}

/** Format session deleted confirmation */
export function formatSessionDeleted(sessionId: string): string {
	return `🗑️ 已删除会话 \`${sessionId}\``;
}

/** Format help text */
export function formatHelp(): string {
	return `🤖 **Feishu Bot for pi Agent**\n\n\
我可以帮你管理 AI agent 会话，在手机上和电脑前无缝切换。

**命令：**
\`/list\` 或 "显示我的会话" — 列出所有会话
\`/new\` 或 "新建会话" — 创建新会话
\`/switch <名称或编号>\` — 切换会话
\`/continue\` 或 "继续" — 继续当前会话
\`/help\` — 显示此帮助

**自然语言：**
你也可以直接说：
- "看看我有哪些会话"
- "切换到登录那个"
- "帮我新建一个会话"
- "接着做"
- 或者直接发消息开始对话

**无缝体验：**
在手机上用飞书，在电脑上用 pi-agent-ui，
你的会话和数据是共享的。`;
}

/** Format an agent reply for IM display */
export function formatAgentReply(text: string): string {
	return text.trim();
}

/** Format a thinking/processing message */
export function formatProcessing(): string {
	return "⏳ 正在处理...";
}

/** Format an error message */
export function formatError(error: string): string {
	return `❌ ${error}`;
}

/** Format a "no current session" message */
export function formatNoSession(): string {
	return "⚠️ 你还没有选择会话。输入 `/list` 查看可用会话。";
}
