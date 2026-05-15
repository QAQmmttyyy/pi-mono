/**
 * Agent client — connects to pi-agent-server via REST and WebSocket.
 *
 * REST: session list / create / delete
 * WebSocket: attach to session, send prompts, receive filtered events
 */

import WebSocket from "ws";
import type { FilteredReply, SessionInfo } from "./types.js";

/** Event from the agent server that the IM bot cares about */
interface AgentEvent {
	type: string;
	[key: string]: unknown;
}

export class AgentClient {
	private baseUrl: string;
	private wsUrl: string;

	constructor(agentServerUrl: string) {
		this.baseUrl = agentServerUrl.replace(/\/+$/, "");
		this.wsUrl = this.baseUrl.replace(/^http/, "ws");
	}

	// =========================================================================
	// REST API
	// =========================================================================

	/** List all sessions from the agent server */
	async listSessions(): Promise<SessionInfo[]> {
		const res = await fetch(`${this.baseUrl}/api/sessions`);
		if (!res.ok) {
			throw new Error(`Failed to list sessions: HTTP ${res.status}`);
		}
		return res.json() as Promise<SessionInfo[]>;
	}

	/** Create a new session */
	async createSession(cwd?: string, name?: string): Promise<SessionInfo> {
		const res = await fetch(`${this.baseUrl}/api/sessions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd, name }),
		});
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
		}
		return res.json() as Promise<SessionInfo>;
	}

	/** Delete a session */
	async deleteSession(sessionId: string): Promise<void> {
		const res = await fetch(`${this.baseUrl}/api/sessions/${sessionId}`, {
			method: "DELETE",
		});
		if (!res.ok) {
			throw new Error(`Failed to delete session: HTTP ${res.status}`);
		}
	}

	/** Rename a session */
	async renameSession(sessionId: string, name: string): Promise<SessionInfo> {
		const res = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/name`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name }),
		});
		if (!res.ok) {
			throw new Error(`Failed to rename session: HTTP ${res.status}`);
		}
		return res.json() as Promise<SessionInfo>;
	}

	// =========================================================================
	// WebSocket — send a prompt and wait for the final reply
	// =========================================================================

	/**
	 * Send a prompt to a session and collect the final reply.
	 *
	 * Opens a WebSocket, sends the prompt, filters events, and resolves with
	 * the final text when the agent finishes. The WS is kept open until
	 * explicitly closed via `close()`.
	 *
	 * @returns A promise that resolves when the agent finishes responding
	 */
	async sendPrompt(
		sessionId: string,
		message: string,
		onReply: (reply: FilteredReply) => void,
		onError: (error: string) => void,
	): Promise<WebSocket> {
		const wsUrl = `${this.wsUrl}/ws/sessions/${sessionId}`;
		const ws = new WebSocket(wsUrl);

		const state = {
			text: "",
			error: "",
			aborted: false,
			promptSent: false,
			hasError: false,
		};

		return new Promise<WebSocket>((resolve, reject) => {
			const timeout = setTimeout(() => {
				if (!state.promptSent) {
					ws.close();
					reject(new Error("Timeout connecting to session"));
				}
			}, 15000);

			ws.onopen = () => {
				// We're connected; now send the prompt
				ws.send(JSON.stringify({ type: "prompt", message }));
				state.promptSent = true;
				clearTimeout(timeout);
				resolve(ws);
			};

			ws.onmessage = (event) => {
				try {
					const msg = JSON.parse(event.data as string) as AgentEvent;
					this.handleEvent(msg, state, onReply, onError, ws);
				} catch {
					// Ignore parse errors
				}
			};

			ws.onerror = () => {
				clearTimeout(timeout);
				if (!state.promptSent) {
					reject(new Error("WebSocket error connecting to session"));
				} else {
					onError("Connection error");
				}
			};

			ws.onclose = () => {
				clearTimeout(timeout);
				// If we never got a proper end, flush whatever we have
				if (state.text && !state.hasError) {
					onReply({ text: state.text });
				}
			};
		});
	}

	/**
	 * Send a "noprompt" message that doesn't trigger agent processing.
	 * For example, session management commands that are handled by the IM bot
	 * but we still need a WS connection to listen for events.
	 */
	async attachSession(
		sessionId: string,
		onReply: (reply: FilteredReply) => void,
		onError: (error: string) => void,
	): Promise<WebSocket> {
		const wsUrl = `${this.wsUrl}/ws/sessions/${sessionId}`;
		const ws = new WebSocket(wsUrl);

		const state = {
			text: "",
			error: "",
			aborted: false,
			promptSent: false,
			hasError: false,
		};

		return new Promise<WebSocket>((resolve, reject) => {
			ws.onopen = () => {
				resolve(ws);
			};

			ws.onmessage = (event) => {
				try {
					const msg = JSON.parse(event.data as string) as AgentEvent;
					this.handleEvent(msg, state, onReply, onError, ws);
				} catch {
					// Ignore parse errors
				}
			};

			ws.onerror = () => {
				reject(new Error("WebSocket error connecting to session"));
			};

			ws.onclose = () => {
				if (state.text && !state.hasError) {
					onReply({ text: state.text });
				}
			};

			// Timeout
			setTimeout(() => reject(new Error("Timeout attaching to session")), 10000);
		});
	}

	/**
	 * Handle an incoming agent event.
	 *
	 * Event filtering logic:
	 * - `text_delta` → accumulate into text buffer
	 * - `thinking_delta` → ignore (not relevant for IM)
	 * - `tool_execution_start/end` → ignore (IM doesn't show tools)
	 * - `message_end` → flush accumulated text as final reply
	 * - `agent_end` → final flush
	 * - `error` → report error
	 */
	private handleEvent(
		msg: AgentEvent,
		state: { text: string; error: string; aborted: boolean; promptSent: boolean; hasError: boolean },
		onReply: (reply: FilteredReply) => void,
		onError: (error: string) => void,
		_ws: WebSocket,
	): void {
		switch (msg.type) {
			case "agent_start":
				state.text = "";
				break;

			case "message_update": {
				const ev = (msg as { assistantMessageEvent?: { type?: string; delta?: string } }).assistantMessageEvent;
				if (ev?.type === "text_delta" && ev.delta) {
					state.text += ev.delta;
				}
				break;
			}

			case "message_end": {
				// Flush the accumulated text
				if (state.text) {
					onReply({ text: state.text });
				}
				break;
			}

			case "agent_end": {
				// Final flush if message_end didn't happen
				if (state.text) {
					onReply({ text: state.text });
				}
				break;
			}

			case "response": {
				const response = msg as unknown as { command: string; success: boolean; error?: string };
				if (response.command === "prompt" && !response.success) {
					state.hasError = true;
					const err = response.error ?? "Unknown error";
					state.error = err;
					onError(err);
				}
				break;
			}

			case "tool_execution_start":
			case "tool_execution_end":
			case "tool_execution_update":
			case "compaction_start":
			case "compaction_end":
				// Ignored — IM doesn't show tool/compaction details
				break;
		}
	}
}
