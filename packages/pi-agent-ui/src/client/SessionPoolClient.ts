/**
 * SessionPoolClient — manages REST API calls and WebSocket connections
 * for a single pi-agent-server backend.
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { SessionInfo, SessionState, WsCommand, WsResponse, WsServerMessage } from "./types.js";

const DEFAULT_BASE_URL = "http://localhost:5173"; // Vite dev proxy handles /api and /ws

export class SessionPoolClient {
	private baseUrl: string;
	private wsConnections = new Map<string, WebSocket>();
	private eventListeners = new Map<string, Set<(msg: WsServerMessage) => void>>();

	constructor(baseUrl = DEFAULT_BASE_URL) {
		this.baseUrl = baseUrl;
	}

	// =========================================================================
	// REST API
	// =========================================================================

	async listSessions(): Promise<SessionInfo[]> {
		const res = await fetch(`${this.baseUrl}/api/sessions`);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return res.json();
	}

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
		return res.json();
	}

	async deleteSession(id: string): Promise<void> {
		const res = await fetch(`${this.baseUrl}/api/sessions/${id}`, {
			method: "DELETE",
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
	}

	async renameSession(id: string, name: string): Promise<SessionInfo> {
		const res = await fetch(`${this.baseUrl}/api/sessions/${id}/name`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name }),
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return res.json();
	}

	// =========================================================================
	// WebSocket
	// =========================================================================

	/** Attach to a session via WebSocket. Returns initial state and messages. */
	attach(sessionId: string): Promise<{ state: SessionState; messages: AgentMessage[] }> {
		// Close previous connection for this session if exists
		this.detach(sessionId);

		return new Promise((resolve, reject) => {
			// Derive WS URL from base URL
			const wsUrl = `${this.baseUrl.replace(/^http/, "ws")}/ws/sessions/${sessionId}`;
			const ws = new WebSocket(wsUrl);

			let stateResolved = false;
			let messagesResolved = false;
			let state: SessionState | null = null;
			let messages: AgentMessage[] = [];

			const tryResolve = () => {
				if (stateResolved && messagesResolved) {
					resolve({ state: state!, messages });
				}
			};

			ws.onopen = () => {
				this.wsConnections.set(sessionId, ws);
			};

			ws.onmessage = (event) => {
				try {
					const msg = JSON.parse(event.data) as WsServerMessage;
					this._dispatch(sessionId, msg);

					// Capture initial state/messages
					if (msg.type === "response" && msg.success) {
						if (msg.command === "get_state") {
							state = msg.data as SessionState;
							stateResolved = true;
							tryResolve();
						} else if (msg.command === "get_messages") {
							messages = (msg.data as { messages: AgentMessage[] })?.messages ?? [];
							messagesResolved = true;
							tryResolve();
						}
					}
				} catch {
					// Ignore parse errors
				}
			};

			ws.onerror = () => {
				if (!stateResolved || !messagesResolved) {
					reject(new Error(`WebSocket error for session ${sessionId}`));
				}
			};

			ws.onclose = () => {
				this.wsConnections.delete(sessionId);
			};

			// Timeout
			setTimeout(() => {
				if (!stateResolved || !messagesResolved) {
					reject(new Error(`Timeout attaching to session ${sessionId}`));
				}
			}, 10000);
		});
	}

	/** Detach from a session WebSocket */
	detach(sessionId: string): void {
		const ws = this.wsConnections.get(sessionId);
		if (ws) {
			ws.close();
			this.wsConnections.delete(sessionId);
		}
		this.eventListeners.delete(sessionId);
	}

	/** Send a command to the active session */
	send(sessionId: string, cmd: WsCommand): void {
		const ws = this.wsConnections.get(sessionId);
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			console.warn("Cannot send: not connected to session", sessionId);
			return;
		}
		ws.send(JSON.stringify(cmd));
	}

	/** Send a prompt to the active session and return response promise */
	sendPrompt(sessionId: string, message: string): Promise<WsResponse> {
		return new Promise((resolve) => {
			const listener = (msg: WsServerMessage) => {
				if (msg.type === "response" && msg.command === "prompt") {
					this.off(sessionId, listener);
					resolve(msg as WsResponse);
				}
			};
			this.on(sessionId, listener);
			this.send(sessionId, { type: "prompt", message });
		});
	}

	/** Subscribe to all messages from a session WebSocket */
	on(sessionId: string, listener: (msg: WsServerMessage) => void): void {
		let set = this.eventListeners.get(sessionId);
		if (!set) {
			set = new Set();
			this.eventListeners.set(sessionId, set);
		}
		set.add(listener);
	}

	/** Unsubscribe from a session */
	off(sessionId: string, listener: (msg: WsServerMessage) => void): void {
		this.eventListeners.get(sessionId)?.delete(listener);
	}

	private _dispatch(sessionId: string, msg: WsServerMessage): void {
		this.eventListeners.get(sessionId)?.forEach((fn) => {
			fn(msg);
		});
	}

	/** Shut down all connections */
	shutdown(): void {
		for (const [id] of this.wsConnections) {
			this.detach(id);
		}
		this.eventListeners.clear();
	}
}

/** Singleton client instance */
let _client: SessionPoolClient | null = null;

export function getClient(): SessionPoolClient {
	if (!_client) {
		_client = new SessionPoolClient();
	}
	return _client;
}
