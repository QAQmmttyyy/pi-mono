/**
 * SessionPool - manages the lifecycle of active agent sessions.
 *
 * Each ActiveSession wraps an AgentSession (from the SDK) and handles:
 * - Lazy loading from JSONL files
 * - Idle unloading when no subscribers remain
 * - Serialized prompt delivery via message queue
 * - Event broadcasting to all attached clients
 */

import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { AgentMessage, ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { Model } from "@mariozechner/pi-ai";
import { type AgentSession, createAgentSession } from "@mariozechner/pi-coding-agent";
import type WebSocket from "ws";
import type { AgentServerConfig } from "./config.js";

/** Result from executing a bash command */
export interface BashExecResult {
	output: string;
	exitCode: number | undefined;
	cancelled?: boolean;
	truncated?: boolean;
	fullOutputPath?: string;
}

/** Represents an active session in the pool */
export interface ActiveSession {
	/** Unique session identifier */
	id: string;
	/** The AgentSession instance (from SDK) */
	agentSession: AgentSession;
	/** Path to the session JSONL file */
	sessionPath: string;
	/** Working directory for this session */
	cwd: string;
	/** Current subscribers (WebSocket clients) */
	subscribers: Set<WebSocket>;
	/** Queued messages waiting to be processed */
	messageQueue: Array<QueuedMessage>;
	/** Whether a prompt is currently being processed */
	isProcessing: boolean;
	/** Timer for idle unload */
	idleTimer: ReturnType<typeof setTimeout> | undefined;
	/** When the session was last active */
	lastActivity: number;
	/** Unsubscribe from agent events */
	unsubscribeEvents?: () => void;
}

interface QueuedMessage {
	type: string;
	payload: string;
	resolve: (value: undefined) => void;
	reject: (error: Error) => void;
}

/** External metadata for a session (used by REST API) */
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

function expandTilde(p: string): string {
	if (p === "~") return homedir();
	if (p.startsWith("~/")) return join(homedir(), p.slice(2));
	return p;
}

export class SessionPool {
	private sessions = new Map<string, ActiveSession>();
	private config: AgentServerConfig;

	constructor(config: AgentServerConfig) {
		this.config = config;
	}

	/** Get or create an active session by ID */
	async getSession(sessionId: string): Promise<ActiveSession> {
		const active = this.sessions.get(sessionId);
		if (active) {
			this._touchActivity(active);
			return active;
		}

		// Check if a session file exists
		const { SessionManager } = await import("@mariozechner/pi-coding-agent");
		const sessions = await SessionManager.listAll();
		const info = sessions.find((s) => s.id === sessionId);
		if (!info) {
			throw new Error(`Session ${sessionId} not found`);
		}

		return this._loadSession(info.path);
	}

	/** Get an already-active session, or undefined if not loaded */
	getActiveSession(sessionId: string): ActiveSession | undefined {
		return this.sessions.get(sessionId);
	}

	/** Create a new session */
	async createSession(cwd?: string, name?: string): Promise<SessionInfo> {
		let resolvedCwd: string;
		if (cwd) {
			const expanded = expandTilde(cwd);
			if (!expanded.startsWith("/")) {
				throw new Error(`Path must be absolute: "${cwd}"`);
			}
			resolvedCwd = resolve(expanded);
			if (!existsSync(resolvedCwd)) {
				throw new Error(`Directory does not exist: "${cwd}"`);
			}
		} else {
			resolvedCwd = resolve(this.config.defaultCwd);
		}

		const { SessionManager } = await import("@mariozechner/pi-coding-agent");
		const sessionManager = SessionManager.create(resolvedCwd);
		const result = await createAgentSession({
			cwd: resolvedCwd,
			sessionManager,
		});

		const session = result.session;
		if (name) {
			session.setSessionName(name);
		}

		const active = this._registerSession(session, sessionManager.getSessionFile()!);
		return this._toSessionInfo(active);
	}

	/** Remove a session from memory (if active) and delete its file */
	async deleteSession(sessionId: string): Promise<void> {
		const active = this.sessions.get(sessionId);
		if (active) {
			this._unloadSession(active);
		}

		// Delete the JSONL file
		const { SessionManager } = await import("@mariozechner/pi-coding-agent");
		const sessions = await SessionManager.listAll();
		const info = sessions.find((s) => s.id === sessionId);
		if (info) {
			try {
				await unlink(info.path);
			} catch {
				// Already deleted
			}
		}
	}

	/** Rename a session */
	async renameSession(sessionId: string, name: string): Promise<SessionInfo> {
		const active = await this.getSession(sessionId);
		active.agentSession.setSessionName(name);
		return this._toSessionInfo(active);
	}

	/** List all sessions (active + on-disk) */
	async listSessions(): Promise<SessionInfo[]> {
		const { SessionManager } = await import("@mariozechner/pi-coding-agent");
		const diskSessions = await SessionManager.listAll();
		const diskFirstMessages = new Map(diskSessions.filter((s) => s.firstMessage).map((s) => [s.id, s.firstMessage]));
		const seen = new Set<string>();

		const result: SessionInfo[] = [];

		// First add all active sessions
		for (const [id, active] of this.sessions) {
			seen.add(id);
			result.push(this._toSessionInfo(active, diskFirstMessages.get(id)));
		}

		// Then add disk sessions not already active
		for (const info of diskSessions) {
			if (seen.has(info.id)) continue;
			seen.add(info.id);
			result.push({
				id: info.id,
				cwd: info.cwd || this.config.defaultCwd,
				name: info.name,
				lastModified: info.modified.toISOString(),
				messageCount: info.messageCount,
				firstMessage: info.firstMessage || "(no messages)",
				isActive: false,
				subscriberCount: 0,
			});
		}

		// Sort by last modified descending
		result.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
		return result;
	}

	/** Subscribe a WebSocket to session events */
	attachClient(sessionId: string, ws: WebSocket): ActiveSession {
		const active = this.sessions.get(sessionId);
		if (!active) {
			throw new Error(`Session ${sessionId} is not active`);
		}
		this._clearIdleTimer(active);
		active.subscribers.add(ws);
		return active;
	}

	/** Unsubscribe a WebSocket from session events */
	detachClient(sessionId: string, ws: WebSocket): void {
		const active = this.sessions.get(sessionId);
		if (!active) return;

		active.subscribers.delete(ws);
		if (active.subscribers.size === 0) {
			this._scheduleIdleUnload(active);
		}
	}

	/** Queue a prompt for serialized execution */
	enqueueMessage(sessionId: string, message: string): Promise<void> {
		const active = this.sessions.get(sessionId);
		if (!active) throw new Error(`Session ${sessionId} is not active`);

		this._clearIdleTimer(active);
		this._touchActivity(active);

		return new Promise<void>((resolve, reject) => {
			active.messageQueue.push({ type: "prompt", payload: message, resolve, reject });
			this._processQueue(active);
		});
	}

	/** Get historical messages for a session */
	getMessages(sessionId: string): AgentMessage[] {
		const active = this.sessions.get(sessionId);
		if (!active) throw new Error(`Session ${sessionId} is not active`);
		return active.agentSession.messages;
	}

	/** Get session state */
	getState(sessionId: string) {
		const active = this.sessions.get(sessionId);
		if (!active) throw new Error(`Session ${sessionId} is not active`);
		const s = active.agentSession;
		return {
			model: s.model,
			thinkingLevel: s.thinkingLevel,
			isStreaming: s.isStreaming,
			isCompacting: s.isCompacting,
			steeringMode: s.steeringMode,
			followUpMode: s.followUpMode,
			sessionFile: s.sessionFile,
			sessionId: s.sessionId,
			sessionName: s.sessionName,
			autoCompactionEnabled: s.autoCompactionEnabled,
			messageCount: s.messages.length,
			pendingMessageCount: s.pendingMessageCount,
		};
	}

	/** Set model for a session */
	async setModel(sessionId: string, provider: string, modelId: string): Promise<Model<any>> {
		const active = await this.getSession(sessionId);
		const model = active.agentSession.modelRegistry.find(provider as any, modelId);
		if (!model) throw new Error(`Model ${provider}/${modelId} not found`);
		await active.agentSession.setModel(model);
		return model;
	}

	/** Get available models */
	async getAvailableModels(sessionId: string): Promise<Model<any>[]> {
		const active = await this.getSession(sessionId);
		return active.agentSession.modelRegistry.getAvailable();
	}

	/** Set thinking level */
	setThinkingLevel(sessionId: string, level: ThinkingLevel): void {
		const active = this.sessions.get(sessionId);
		if (!active) throw new Error(`Session ${sessionId} is not active`);
		active.agentSession.setThinkingLevel(level);
	}

	/** Cycle thinking level */
	cycleThinkingLevel(sessionId: string): ThinkingLevel | undefined {
		const active = this.sessions.get(sessionId);
		if (!active) throw new Error(`Session ${sessionId} is not active`);
		return active.agentSession.cycleThinkingLevel();
	}

	/** Cycle model */
	async cycleModel(sessionId: string, direction: "forward" | "backward" = "forward") {
		const active = this.sessions.get(sessionId);
		if (!active) throw new Error(`Session ${sessionId} is not active`);
		return active.agentSession.cycleModel(direction);
	}

	/** Set steering mode */
	setSteeringMode(sessionId: string, mode: "all" | "one-at-a-time"): void {
		const active = this.sessions.get(sessionId);
		if (!active) throw new Error(`Session ${sessionId} is not active`);
		active.agentSession.setSteeringMode(mode);
	}

	/** Set follow-up mode */
	setFollowUpMode(sessionId: string, mode: "all" | "one-at-a-time"): void {
		const active = this.sessions.get(sessionId);
		if (!active) throw new Error(`Session ${sessionId} is not active`);
		active.agentSession.setFollowUpMode(mode);
	}

	/** Set auto compaction */
	setAutoCompaction(sessionId: string, enabled: boolean): void {
		const active = this.sessions.get(sessionId);
		if (!active) throw new Error(`Session ${sessionId} is not active`);
		active.agentSession.setAutoCompactionEnabled(enabled);
	}

	/** Set auto retry */
	setAutoRetry(sessionId: string, enabled: boolean): void {
		const active = this.sessions.get(sessionId);
		if (!active) throw new Error(`Session ${sessionId} is not active`);
		active.agentSession.setAutoRetryEnabled(enabled);
	}

	/** Abort current streaming prompt */
	async abort(sessionId: string): Promise<void> {
		const active = this.sessions.get(sessionId);
		if (!active) throw new Error(`Session ${sessionId} is not active`);
		await active.agentSession.abort();
	}

	/** Execute bash command */
	async executeBash(sessionId: string, command: string): Promise<BashExecResult> {
		const active = this.sessions.get(sessionId);
		if (!active) throw new Error(`Session ${sessionId} is not active`);
		const result = await active.agentSession.executeBash(command);
		return {
			output: result.output,
			exitCode: result.exitCode,
			cancelled: result.cancelled,
			truncated: result.truncated,
			fullOutputPath: result.fullOutputPath,
		};
	}

	/** Get session stats */
	getSessionStats(sessionId: string) {
		const active = this.sessions.get(sessionId);
		if (!active) throw new Error(`Session ${sessionId} is not active`);
		return active.agentSession.getSessionStats();
	}

	/** Export to HTML */
	async exportHtml(sessionId: string, outputPath?: string) {
		const active = this.sessions.get(sessionId);
		if (!active) throw new Error(`Session ${sessionId} is not active`);
		return active.agentSession.exportToHtml(outputPath);
	}

	/** Get fork messages */
	getForkMessages(sessionId: string) {
		const active = this.sessions.get(sessionId);
		if (!active) throw new Error(`Session ${sessionId} is not active`);
		return active.agentSession.getUserMessagesForForking();
	}

	/** Get last assistant text */
	getLastAssistantText(sessionId: string) {
		const active = this.sessions.get(sessionId);
		if (!active) throw new Error(`Session ${sessionId} is not active`);
		return active.agentSession.getLastAssistantText();
	}

	/** Get available slash commands */
	getCommands(sessionId: string) {
		const active = this.sessions.get(sessionId);
		if (!active) throw new Error(`Session ${sessionId} is not active`);
		// AgentSession doesn't expose this directly, but it's available through the extension runner
		// For now, return empty - or we could expose it via internal API
		return [];
	}

	// =========================================================================
	// Internal helpers
	// =========================================================================

	private async _loadSession(sessionPath: string): Promise<ActiveSession> {
		const { SessionManager } = await import("@mariozechner/pi-coding-agent");
		const sessionManager = SessionManager.open(sessionPath);
		const cwd = sessionManager.getCwd();

		const result = await createAgentSession({
			cwd,
			sessionManager,
		});

		return this._registerSession(result.session, sessionPath);
	}

	private _registerSession(agentSession: AgentSession, sessionPath: string): ActiveSession {
		const id = agentSession.sessionId;
		const active: ActiveSession = {
			id,
			agentSession,
			sessionPath,
			cwd: agentSession.sessionManager.getCwd(),
			subscribers: new Set(),
			messageQueue: [],
			isProcessing: false,
			idleTimer: undefined,
			lastActivity: Date.now(),
		};

		// Subscribe to events for broadcasting
		active.unsubscribeEvents = agentSession.subscribe((event) => {
			this._broadcastEvent(active, event);
		});

		// If an existing session with same ID exists, unload it first
		const existing = this.sessions.get(id);
		if (existing) {
			this._unloadSession(existing);
		}

		this.sessions.set(id, active);
		return active;
	}

	private _broadcastEvent(active: ActiveSession, event: unknown): void {
		const message = JSON.stringify(event);
		for (const ws of active.subscribers) {
			if (ws.readyState === ws.OPEN) {
				try {
					ws.send(message);
				} catch {
					// Remove broken connections
					active.subscribers.delete(ws);
				}
			}
		}
	}

	private async _processQueue(active: ActiveSession): Promise<void> {
		if (active.isProcessing) return;

		const next = active.messageQueue.shift();
		if (!next) return;

		active.isProcessing = true;
		try {
			await active.agentSession.prompt(next.payload);
			next.resolve(undefined);
		} catch (err) {
			next.reject(err instanceof Error ? err : new Error(String(err)));
		} finally {
			active.isProcessing = false;
			// Process next in queue
			if (active.messageQueue.length > 0) {
				this._processQueue(active);
			}
		}
	}

	private _touchActivity(active: ActiveSession): void {
		active.lastActivity = Date.now();
	}

	private _clearIdleTimer(active: ActiveSession): void {
		if (active.idleTimer) {
			clearTimeout(active.idleTimer);
			active.idleTimer = undefined;
		}
	}

	private _scheduleIdleUnload(active: ActiveSession): void {
		this._clearIdleTimer(active);
		if (this.config.idleUnloadMs <= 0) return;
		active.idleTimer = setTimeout(() => {
			if (active.subscribers.size === 0) {
				this._unloadSession(active);
			}
		}, this.config.idleUnloadMs);
	}

	private _unloadSession(active: ActiveSession): void {
		this._clearIdleTimer(active);
		if (active.unsubscribeEvents) {
			active.unsubscribeEvents();
		}
		active.agentSession.dispose();
		this.sessions.delete(active.id);
	}

	private _toSessionInfo(active: ActiveSession, diskFirstMessage?: string): SessionInfo {
		const s = active.agentSession;
		let firstMessage = diskFirstMessage;
		if (firstMessage === undefined) {
			// Only extract from memory for brand-new sessions not yet on disk
			const firstUserMsg = s.messages.find((m) => m.role === "user");
			if (firstUserMsg) {
				const content = firstUserMsg.content;
				if (typeof content === "string") {
					firstMessage = content;
				} else if (Array.isArray(content)) {
					firstMessage = content
						.filter((c): c is { type: "text"; text: string } => c.type === "text")
						.map((c) => c.text)
						.join(" ");
				}
			}
		}
		return {
			id: s.sessionId,
			cwd: s.sessionManager.getCwd(),
			name: s.sessionName,
			lastModified: new Date(active.lastActivity).toISOString(),
			messageCount: s.messages.length,
			firstMessage: firstMessage ?? "",
			isActive: true,
			subscriberCount: active.subscribers.size,
		};
	}

	/** Shut down the pool, disposing all sessions */
	async shutdown(): Promise<void> {
		for (const [, active] of this.sessions) {
			this._unloadSession(active);
		}
		this.sessions.clear();
	}
}
