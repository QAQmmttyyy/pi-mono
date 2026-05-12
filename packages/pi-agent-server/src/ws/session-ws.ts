/**
 * WebSocket handler for real-time session interaction.
 *
 * Client → Server (reuses RpcCommand):
 *   { "type": "prompt", "message": "..." }
 *   { "type": "abort" }
 *   { "type": "get_messages" }
 *   { "type": "get_state" }
 *   { "type": "set_model", "provider": "...", "modelId": "..." }
 *   { "type": "cycle_model" }
 *   { "type": "get_available_models" }
 *   { "type": "set_thinking_level", "level": "..." }
 *   { "type": "cycle_thinking_level" }
 *   { "type": "set_steering_mode", "mode": "..." }
 *   { "type": "set_follow_up_mode", "mode": "..." }
 *   { "type": "compact" }
 *   { "type": "set_auto_compaction", "enabled": true/false }
 *   { "type": "set_auto_retry", "enabled": true/false }
 *   { "type": "bash", "command": "..." }
 *   { "type": "get_session_stats" }
 *   { "type": "export_html" }
 *   { "type": "get_fork_messages" }
 *   { "type": "get_last_assistant_text" }
 *
 * Server → Client (RpcResponse + AgentSessionEvent):
 *   { "type": "response", "command": "...", "success": true, ... }
 *   { "type": "agent_start" }
 *   { "type": "message_start", "message": {...} }
 *   { "type": "message_update", "assistantMessageEvent": {...} }
 *   { "type": "message_end", "message": {...} }
 *   ... all other AgentSessionEvents
 */

import type { IncomingMessage } from "node:http";
import type { WebSocket, WebSocketServer } from "ws";
import type { SessionPool } from "../session-pool.js";

/** Known command types that arrive over WebSocket */
interface WsCommand {
	type: string;
	message?: string;
	provider?: string;
	modelId?: string;
	model?: string;
	level?: string;
	mode?: string;
	enabled?: boolean;
	command?: string;
	outputPath?: string;
	images?: unknown[];
	streamingBehavior?: string;
	customInstructions?: string;
	direction?: string;
	name?: string;
}

/** Send JSON to a WebSocket client */
function send(ws: WebSocket, data: unknown): void {
	if (ws.readyState !== ws.OPEN) return;
	try {
		ws.send(JSON.stringify(data));
	} catch {
		// Ignore send errors
	}
}

/** Send error response */
function sendError(ws: WebSocket, command: string, error: string): void {
	send(ws, { type: "response", command, success: false, error });
}

/** Send success response */
function sendOk(ws: WebSocket, command: string, data?: unknown): void {
	send(ws, { type: "response", command, success: true, data });
}

/** Handle a single WS command */
async function handleCommand(pool: SessionPool, sessionId: string, ws: WebSocket, cmd: WsCommand): Promise<void> {
	switch (cmd.type) {
		case "prompt": {
			if (!cmd.message) {
				sendError(ws, "prompt", "Missing 'message' field");
				return;
			}
			sendOk(ws, "prompt");
			try {
				await pool.enqueueMessage(sessionId, cmd.message);
			} catch (err) {
				send(ws, {
					type: "response",
					command: "prompt",
					success: false,
					error: String(err),
				});
			}
			break;
		}

		case "abort": {
			try {
				await pool.abort(sessionId);
				sendOk(ws, "abort");
			} catch (err) {
				sendError(ws, "abort", String(err));
			}
			break;
		}

		case "get_messages": {
			try {
				const messages = pool.getMessages(sessionId);
				sendOk(ws, "get_messages", { messages });
			} catch (err) {
				sendError(ws, "get_messages", String(err));
			}
			break;
		}

		case "get_state": {
			try {
				const state = pool.getState(sessionId);
				sendOk(ws, "get_state", state);
			} catch (err) {
				sendError(ws, "get_state", String(err));
			}
			break;
		}

		case "set_model": {
			try {
				if (!cmd.provider || !cmd.modelId) {
					sendError(ws, "set_model", "Missing 'provider' or 'modelId'");
					return;
				}
				const model = await pool.setModel(sessionId, cmd.provider, cmd.modelId);
				sendOk(ws, "set_model", model);
			} catch (err) {
				sendError(ws, "set_model", String(err));
			}
			break;
		}

		case "cycle_model": {
			try {
				const dir = (cmd.direction === "backward" ? "backward" : "forward") as "forward" | "backward";
				const result = await pool.cycleModel(sessionId, dir);
				sendOk(ws, "cycle_model", result ?? null);
			} catch (err) {
				sendError(ws, "cycle_model", String(err));
			}
			break;
		}

		case "get_available_models": {
			try {
				const models = await pool.getAvailableModels(sessionId);
				sendOk(ws, "get_available_models", { models });
			} catch (err) {
				sendError(ws, "get_available_models", String(err));
			}
			break;
		}

		case "set_thinking_level": {
			try {
				if (!cmd.level) {
					sendError(ws, "set_thinking_level", "Missing 'level'");
					return;
				}
				pool.setThinkingLevel(sessionId, cmd.level as any);
				sendOk(ws, "set_thinking_level");
			} catch (err) {
				sendError(ws, "set_thinking_level", String(err));
			}
			break;
		}

		case "cycle_thinking_level": {
			try {
				const level = pool.cycleThinkingLevel(sessionId);
				sendOk(ws, "cycle_thinking_level", level ? { level } : null);
			} catch (err) {
				sendError(ws, "cycle_thinking_level", String(err));
			}
			break;
		}

		case "set_steering_mode": {
			try {
				if (!cmd.mode || (cmd.mode !== "all" && cmd.mode !== "one-at-a-time")) {
					sendError(ws, "set_steering_mode", "Invalid mode. Must be 'all' or 'one-at-a-time'");
					return;
				}
				pool.setSteeringMode(sessionId, cmd.mode);
				sendOk(ws, "set_steering_mode");
			} catch (err) {
				sendError(ws, "set_steering_mode", String(err));
			}
			break;
		}

		case "set_follow_up_mode": {
			try {
				if (!cmd.mode || (cmd.mode !== "all" && cmd.mode !== "one-at-a-time")) {
					sendError(ws, "set_follow_up_mode", "Invalid mode. Must be 'all' or 'one-at-a-time'");
					return;
				}
				pool.setFollowUpMode(sessionId, cmd.mode);
				sendOk(ws, "set_follow_up_mode");
			} catch (err) {
				sendError(ws, "set_follow_up_mode", String(err));
			}
			break;
		}

		case "compact": {
			try {
				// compact is async in AgentSession; we need to call it
				const active = pool.getActiveSession(sessionId);
				if (!active) {
					sendError(ws, "compact", `Session ${sessionId} not active`);
					return;
				}
				const result = await active.agentSession.compact(cmd.customInstructions);
				sendOk(ws, "compact", result);
			} catch (err) {
				sendError(ws, "compact", String(err));
			}
			break;
		}

		case "set_auto_compaction": {
			try {
				if (cmd.enabled === undefined) {
					sendError(ws, "set_auto_compaction", "Missing 'enabled' field");
					return;
				}
				pool.setAutoCompaction(sessionId, cmd.enabled);
				sendOk(ws, "set_auto_compaction");
			} catch (err) {
				sendError(ws, "set_auto_compaction", String(err));
			}
			break;
		}

		case "set_auto_retry": {
			try {
				if (cmd.enabled === undefined) {
					sendError(ws, "set_auto_retry", "Missing 'enabled' field");
					return;
				}
				pool.setAutoRetry(sessionId, cmd.enabled);
				sendOk(ws, "set_auto_retry");
			} catch (err) {
				sendError(ws, "set_auto_retry", String(err));
			}
			break;
		}

		case "bash": {
			try {
				if (!cmd.command) {
					sendError(ws, "bash", "Missing 'command' field");
					return;
				}
				const result = await pool.executeBash(sessionId, cmd.command);
				sendOk(ws, "bash", result);
			} catch (err) {
				sendError(ws, "bash", String(err));
			}
			break;
		}

		case "get_session_stats": {
			try {
				const stats = pool.getSessionStats(sessionId);
				sendOk(ws, "get_session_stats", stats);
			} catch (err) {
				sendError(ws, "get_session_stats", String(err));
			}
			break;
		}

		case "export_html": {
			try {
				const result = await pool.exportHtml(sessionId, cmd.outputPath);
				sendOk(ws, "export_html", { path: result });
			} catch (err) {
				sendError(ws, "export_html", String(err));
			}
			break;
		}

		case "get_fork_messages": {
			try {
				const messages = pool.getForkMessages(sessionId);
				sendOk(ws, "get_fork_messages", { messages });
			} catch (err) {
				sendError(ws, "get_fork_messages", String(err));
			}
			break;
		}

		case "get_last_assistant_text": {
			try {
				const text = pool.getLastAssistantText(sessionId);
				sendOk(ws, "get_last_assistant_text", { text });
			} catch (err) {
				sendError(ws, "get_last_assistant_text", String(err));
			}
			break;
		}

		default: {
			sendError(ws, cmd.type, `Unknown command: ${cmd.type}`);
		}
	}
}

/** Create and configure a WebSocket server for session communication */
export function createSessionWsServer(wss: WebSocketServer, pool: SessionPool): void {
	wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
		// Extract session ID from URL path: /ws/sessions/:id
		const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
		const pathParts = url.pathname.split("/").filter(Boolean);
		// Expected: ws/sessions/:id
		const sessionIdx = pathParts.indexOf("ws") !== -1 ? pathParts.indexOf("ws") : pathParts.indexOf("sessions");
		let sessionId: string | undefined;
		if (sessionIdx >= 0 && pathParts.length >= sessionIdx + 3) {
			sessionId = pathParts[sessionIdx + 2];
		} else if (pathParts.length >= 2 && pathParts[0] === "ws" && pathParts[1] === "sessions") {
			sessionId = pathParts[2];
		}

		if (!sessionId) {
			send(ws, { type: "error", error: "Missing session ID in path. Use /ws/sessions/:id" });
			ws.close(4000, "Missing session ID");
			return;
		}

		// Check if session exists, and if not active, try to load it from disk
		let active = pool.getActiveSession(sessionId);
		const handleConnected = (
			loaded: Awaited<ReturnType<typeof pool.getActiveSession>> | Awaited<ReturnType<typeof pool.getSession>>,
		) => {
			if (!loaded) return;
			active = loaded;
			const attached = pool.attachClient(loaded.id, ws);
			setupClient(ws, attached.id, pool);
			sendInitialState(ws, attached.id, pool);
		};

		if (!active) {
			pool
				.getSession(sessionId)
				.then(handleConnected)
				.catch((err) => {
					send(ws, { type: "error", error: String(err) });
					ws.close(4004, String(err));
				});
			return;
		}

		// Session is active, check for external file changes (e.g. from TUI)
		pool.refreshIfStale(sessionId).then(handleConnected);
	});
}

function setupClient(ws: WebSocket, sessionId: string, pool: SessionPool): void {
	ws.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
		const data = Buffer.isBuffer(raw) ? raw.toString("utf8") : raw.toString();
		let cmd: WsCommand;
		try {
			cmd = JSON.parse(data);
		} catch {
			send(ws, { type: "error", error: "Invalid JSON" });
			return;
		}

		if (!cmd.type) {
			send(ws, { type: "error", error: "Missing 'type' field" });
			return;
		}

		handleCommand(pool, sessionId, ws, cmd).catch((err) => {
			send(ws, { type: "error", error: String(err) });
		});
	});

	ws.on("close", () => {
		pool.detachClient(sessionId, ws);
	});

	ws.on("error", () => {
		pool.detachClient(sessionId, ws);
	});
}

/** Send the initial session state and historical messages when a client attaches */
function sendInitialState(ws: WebSocket, sessionId: string, pool: SessionPool): void {
	try {
		const state = pool.getState(sessionId);
		send(ws, { type: "response", command: "get_state", success: true, data: state });

		const messages = pool.getMessages(sessionId);
		send(ws, { type: "response", command: "get_messages", success: true, data: { messages } });
	} catch {
		// Session may not be active yet
	}
}
