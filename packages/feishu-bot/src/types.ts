/**
 * Types for the feishu-bot package.
 */

// ============================================================================
// Session info from agent-server REST API
// ============================================================================

export interface SessionInfo {
	id: string;
	cwd: string;
	name?: string;
	lastModified: string;
	messageCount: number;
	firstMessage: string;
	isActive: boolean;
	subscriberCount: number;
}

// ============================================================================
// Configuration
// ============================================================================

export interface BotConfig {
	/** URL of the pi-agent-server (e.g., http://localhost:3000) */
	agentServerUrl: string;
	/** Feishu bot app ID */
	feishuAppId: string;
	/** Feishu bot app secret */
	feishuAppSecret: string;
	/** Directory for persistent data (session mappings, logs) */
	dataDir: string;
	/** Webhook port (only used if Feishu uses webhook transport instead of WS) */
	webhookPort: number;
}

// ============================================================================
// Session mapping (per Feishu chat)
// ============================================================================

/** Persisted mapping between a Feishu chat and agent sessions */
export interface ChatSessionMapping {
	/** Currently active agent session ID, or null */
	currentSessionId: string | null;
	/** History of sessions used in this chat */
	history: Array<{
		id: string;
		name?: string;
		firstMessage: string;
		lastActive: string;
	}>;
	createdAt: string;
	updatedAt: string;
}

/** All mappings persisted to disk */
export interface SessionMappings {
	[chatId: string]: ChatSessionMapping;
}

// ============================================================================
// Intent recognition
// ============================================================================

export type IntentAction =
	| { type: "list_sessions" }
	| { type: "create_session"; name?: string }
	| { type: "switch_session"; sessionId?: string; search?: string }
	| { type: "continue" }
	| { type: "message"; text: string }
	| { type: "help" }
	| { type: "unknown" };

// ============================================================================
// Agent server session info (subset of MappedSession)
// ============================================================================

export interface MappedSession {
	id: string;
	name?: string;
	cwd?: string;
	firstMessage: string;
	lastModified: string;
	messageCount: number;
}

// ============================================================================
// Filtered event from agent server (IM-friendly)
// ============================================================================

export interface FilteredReply {
	/** Final text content from the agent */
	text: string;
	/** Any error message */
	error?: string;
	/** Whether the response was aborted */
	aborted?: boolean;
}
