/**
 * Client-side types matching the pi-agent-server protocol.
 */

import type { Model } from "@mariozechner/pi-ai";

// ============================================================================
// Session metadata (matches REST /api/sessions response)
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
// Session state (matches RpcSessionState)
// ============================================================================

export interface SessionState {
	model?: Model<any>;
	thinkingLevel: string;
	isStreaming: boolean;
	isCompacting: boolean;
	steeringMode: "all" | "one-at-a-time";
	followUpMode: "all" | "one-at-a-time";
	sessionFile?: string;
	sessionId: string;
	sessionName?: string;
	autoCompactionEnabled: boolean;
	messageCount: number;
	pendingMessageCount: number;
}

// ============================================================================
// WebSocket commands (client → server)
// ============================================================================

export type WsCommand =
	| { type: "prompt"; message: string }
	| { type: "abort" }
	| { type: "get_messages" }
	| { type: "get_state" }
	| { type: "set_model"; provider: string; modelId: string }
	| { type: "cycle_model"; direction?: "forward" | "backward" }
	| { type: "get_available_models" }
	| { type: "set_thinking_level"; level: string }
	| { type: "cycle_thinking_level" }
	| { type: "set_steering_mode"; mode: "all" | "one-at-a-time" }
	| { type: "set_follow_up_mode"; mode: "all" | "one-at-a-time" }
	| { type: "compact"; customInstructions?: string }
	| { type: "set_auto_compaction"; enabled: boolean }
	| { type: "set_auto_retry"; enabled: boolean }
	| { type: "bash"; command: string }
	| { type: "get_session_stats" }
	| { type: "export_html"; outputPath?: string }
	| { type: "get_fork_messages" }
	| { type: "get_last_assistant_text" };

// ============================================================================
// WebSocket server → client messages
// ============================================================================

export type WsServerMessage = WsResponse | WsEvent;

export interface WsResponse {
	type: "response";
	command: string;
	success: boolean;
	data?: unknown;
	error?: string;
}

/** Raw agent event from the server */
export interface WsEvent {
	type: string;
	[key: string]: unknown;
}

// ============================================================================
// UI display message (our internal representation)
// ============================================================================

export type DisplayMessage = DisplayUserMessage | DisplayAssistantMessage | DisplaySystemMessage;

export interface DisplayUserMessage {
	id: string;
	role: "user";
	content: string;
	timestamp: number;
}

export interface DisplayAssistantMessage {
	id: string;
	role: "assistant";
	content: string;
	thinking?: string;
	tools: DisplayTool[];
	stopReason?: string;
	errorMessage?: string;
	timestamp: number;
}

export interface DisplayTool {
	id: string;
	title: string;
	label: string;
	status: "active" | "completed" | "error";
	toolInput?: unknown;
	toolOutput?: string;
	toolIsError?: boolean;
}

export interface DisplayUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	total: number;
	cost: number;
}

export interface DisplaySystemMessage {
	id: string;
	role: "system";
	content: string;
	level: "info" | "warning" | "error";
	timestamp: number;
}
