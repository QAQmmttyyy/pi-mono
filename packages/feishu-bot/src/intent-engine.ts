/**
 * Intent engine — recognizes natural language intent for session management.
 *
 * Two-phase approach:
 * 1. Explicit slash commands: /list, /new, /switch, /continue, /help
 * 2. Natural language: pattern matching for common Chinese phrases
 *
 * Future: optional quick LLM call for deeper NLU
 */

import type { IntentAction, MappedSession } from "./types.js";

// ============================================================================
// Explicit slash commands
// ============================================================================

const SLASH_COMMAND_PATTERNS: Array<{
	pattern: RegExp;
	action: (match: RegExpExecArray) => IntentAction;
}> = [
	{
		pattern: /^\/list\s*$/i,
		action: () => ({ type: "list_sessions" }),
	},
	{
		pattern: /^\/new(?:\s+(.+))?$/i,
		action: (m) => ({ type: "create_session", name: m[1]?.trim() }),
	},
	{
		pattern: /^\/switch(?:\s+(.+))?$/i,
		action: (m) => {
			const arg = m[1]?.trim();
			if (!arg) return { type: "list_sessions" };
			// Try to interpret as session ID or name
			return { type: "switch_session", search: arg };
		},
	},
	{
		pattern: /^\/continue\s*$/i,
		action: () => ({ type: "continue" }),
	},
	{
		pattern: /^\/help\s*$/i,
		action: () => ({ type: "help" }),
	},
];

// ============================================================================
// Natural language patterns (Chinese + English)
// ============================================================================

/**
 * These patterns are checked in order. Each matches against the lowercase
 * version of the user's message. This provides basic NLU without LLM cost.
 */
const NL_PATTERNS: Array<{
	test: (lower: string) => boolean;
	action: () => IntentAction;
}> = [
	// List sessions
	{
		test: (s) =>
			/(我的)?(会话|session|对话)\s*(有哪些|列表|看看|有什么|全部)|列出(.*)会话|查看(.*)会话|显示(.*)会话|最近(.*)(会话|对话)|有哪些(.*)(会话|session|对话)|list\s*(sessions)?/.test(
				s,
			),
		action: () => ({ type: "list_sessions" }),
	},

	// Create new session
	{
		test: (s) =>
			/新建(.*)(会话|对话|session)|新(建一个|建|的)(.*)|创建(.*)会话|开始一个新的|开一个新|create\s*(new)?\s*session/.test(
				s,
			),
		action: () => ({ type: "create_session" }),
	},

	// Continue existing
	{
		test: (s) => /(继续|接着|接续|延续)(.*)(说|做|聊|对话|会话)|继续|续上|continue/.test(s),
		action: () => ({ type: "continue" }),
	},

	// Help
	{
		test: (s) => /帮助|help|说明|使用帮助|怎么用|功能/.test(s),
		action: () => ({ type: "help" }),
	},

	// Switch to a specific session - "切换到登录那个", "用支付的那个", etc.
	{
		test: (s) => /(切换|切到|转去|换到|用)(.*)(会话|对话|session)/.test(s),
		action: () => {
			// Extract the search term - will be handled by the router with fuzzy matching
			return { type: "switch_session" };
		},
	},
];

// ============================================================================
// Session name fuzzy matching
// ============================================================================

export interface MatchResult {
	session: MappedSession;
	score: number;
}

/**
 * Find the best matching session from a list given a search string.
 * Uses basic fuzzy matching:
 * - Exact name match (highest)
 * - Name contains search term
 * - First message contains search term
 * - ID prefix match
 */
export function findBestSession(sessions: MappedSession[], search: string): MappedSession | undefined {
	if (!search) return undefined;

	const lowerSearch = search.toLowerCase();
	const scored: MatchResult[] = [];

	for (const session of sessions) {
		let score = 0;
		const name = (session.name ?? "").toLowerCase();
		const firstMessage = session.firstMessage.toLowerCase();

		// Exact name match
		if (name === lowerSearch) score = 100;
		else if (name.startsWith(lowerSearch)) score = 80;
		else if (name.includes(lowerSearch)) score = 60;
		else if (firstMessage === lowerSearch) score = 50;
		else if (firstMessage.startsWith(lowerSearch)) score = 40;
		else if (firstMessage.includes(lowerSearch)) score = 30;
		else if (session.id.startsWith(lowerSearch)) score = 20;

		if (score > 0) {
			scored.push({ session, score });
		}
	}

	scored.sort((a, b) => b.score - a.score);
	return scored[0]?.session;
}

// ============================================================================
// Main intent recognition
// ============================================================================

/**
 * Parse a user message and determine the intent.
 */
export function parseIntent(message: string): IntentAction {
	const trimmed = message.trim();
	if (!trimmed) return { type: "unknown" };

	// 1. Check slash commands first
	for (const handler of SLASH_COMMAND_PATTERNS) {
		const match = handler.pattern.exec(trimmed);
		if (match) {
			return handler.action(match);
		}
	}

	// 2. Check natural language patterns
	const lower = trimmed.toLowerCase();
	for (const handler of NL_PATTERNS) {
		if (handler.test(lower)) {
			return handler.action();
		}
	}

	// 3. Default: treat as a regular message
	return { type: "message", text: trimmed };
}

/**
 * Determine if an intent is a "meta" command (session management)
 * vs an actual conversation message.
 */
export function isMetaCommand(action: IntentAction): boolean {
	return action.type !== "message" && action.type !== "unknown";
}
