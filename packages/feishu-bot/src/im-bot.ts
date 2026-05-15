/**
 * IM bot core orchestrator — wires together Feishu, agent-server,
 * session mapping, intent recognition, and event filtering.
 */

import type { NormalizedMessage } from "@larksuiteoapi/node-sdk";
import WebSocket from "ws";
import { AgentClient } from "./agent-client.js";
import { FeishuAdapter } from "./feishu-adapter.js";
import {
	formatAgentReply,
	formatError,
	formatHelp,
	formatNoSession,
	formatSessionCreated,
	formatSessionList,
	formatSessionListCompact,
	formatSessionSwitched,
} from "./formatter.js";
import { findBestSession, isMetaCommand, parseIntent } from "./intent-engine.js";
import { JsonlLogger } from "./logger.js";
import { SessionMapper } from "./session-mapper.js";
import type { BotConfig, FilteredReply, MappedSession } from "./types.js";

/**
 * Active WebSocket connection to an agent session.
 */
interface WsConnection {
	ws: WebSocket;
	sessionId: string;
	chatId: string;
	/** Accumulated text across all assistant messages in this turn */
	textBuffer: string;
	/** Whether a prompt is currently in flight */
	isPrompting: boolean;
	/** Whether we're between a toolUse message_end and the next assistant response */
	awaitingToolResults: boolean;
	pendingResolve?: (reply: FilteredReply) => void;
}

export class IMBot {
	private config: BotConfig;
	private feishu!: FeishuAdapter;
	private agent!: AgentClient;
	private mapper!: SessionMapper;
	private logger!: JsonlLogger;
	private wsConnections = new Map<string, WsConnection>();
	private started = false;

	constructor(config: BotConfig) {
		this.config = config;
		this.logger = new JsonlLogger(config.dataDir);
	}

	async start(): Promise<void> {
		if (this.started) return;

		await this.logger.init();
		this.logger.info("system", "Bot starting", { agentServerUrl: this.config.agentServerUrl });

		this.agent = new AgentClient(this.config.agentServerUrl);
		this.mapper = new SessionMapper(this.config.dataDir);
		await this.mapper.load();
		this.logger.info("system", "Session mapper loaded", {
			chatCount: this.mapper.getAllChatIds().length,
		});

		this.feishu = new FeishuAdapter(this.config, {
			onMessage: (msg) => this.handleFeishuMessage(msg),
			onError: (err) => {
				console.error("[im-bot] Feishu error:", err);
				this.logger.error("connection", "Feishu channel error", {
					code: (err as { code?: unknown }).code,
					message: err instanceof Error ? err.message : String(err),
				});
			},
			onBotAdded: async (chatId) => {
				console.log(`[im-bot] Bot added to chat ${chatId}`);
				this.logger.info("system", "Bot added to chat", { chatId });
			},
			onConnectionChange: (connected) => {
				console.log(`[im-bot] Feishu connection: ${connected ? "connected" : "disconnected"}`);
				this.logger.info("connection", `Feishu ${connected ? "connected" : "disconnected"}`);
			},
		});

		await this.feishu.start();

		this.started = true;
		this.logger.info("system", "Bot started");
		console.log("[im-bot] Bot started");
		console.log(`[im-bot] Agent server: ${this.config.agentServerUrl}`);
	}

	// =========================================================================
	// Message handling
	// =========================================================================

	private async handleFeishuMessage(msg: NormalizedMessage): Promise<void> {
		const chatId = msg.chatId;
		const text = msg.content ?? "";

		if (!text.trim()) return;

		this.logger.info("message", "Received message", {
			chatId,
			text: text.slice(0, 120),
			messageId: msg.messageId,
		});

		// Send a placeholder that we'll edit with the actual response
		const placeholderId = await this.feishu.sendPlaceholder(chatId);

		try {
			await this.routeMessage(placeholderId, chatId, text);
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			console.error(`[im-bot] Error routing message: ${errorMsg}`);
			this.logger.error("message", "Failed to route message", {
				chatId,
				err: err instanceof Error ? { message: err.message, stack: err.stack } : String(err),
			});
			await this.feishu.reply(placeholderId, chatId, formatError(errorMsg));
		}
	}

	private async routeMessage(placeholderId: string | undefined, chatId: string, text: string): Promise<void> {
		const intent = parseIntent(text);

		if (isMetaCommand(intent)) {
			await this.handleMetaCommand(placeholderId, chatId, intent);
			return;
		}

		await this.handleConversation(placeholderId, chatId, text);
	}

	// =========================================================================
	// Meta commands
	// =========================================================================

	private async handleMetaCommand(
		placeholderId: string | undefined,
		chatId: string,
		intent: ReturnType<typeof parseIntent>,
	): Promise<void> {
		switch (intent.type) {
			case "list_sessions":
				await this.handleListSessions(placeholderId, chatId);
				break;
			case "create_session":
				await this.handleCreateSession(placeholderId, chatId, intent.name);
				break;
			case "switch_session":
				await this.handleSwitchSession(placeholderId, chatId, intent.sessionId, intent.search);
				break;
			case "continue":
				await this.handleContinue(placeholderId, chatId);
				break;
			case "help":
				await this.feishu.reply(placeholderId, chatId, formatHelp());
				break;
		}
	}

	private async handleListSessions(placeholderId: string | undefined, chatId: string): Promise<void> {
		const mapping = this.mapper.getOrCreate(chatId);
		const sessions = await this.agent.listSessions();

		if (sessions.length === 0) {
			await this.feishu.reply(placeholderId, chatId, formatSessionList([], null, []));
			return;
		}

		const mapped: MappedSession[] = sessions.map((s) => ({
			id: s.id,
			name: s.name,
			cwd: (s as any).cwd,
			firstMessage: s.firstMessage,
			lastModified: s.lastModified,
			messageCount: s.messageCount,
		}));

		for (const s of mapped) {
			this.mapper.addToHistory(chatId, s);
		}

		const historyIds = mapping.history.map((h) => h.id);
		await this.feishu.reply(placeholderId, chatId, formatSessionList(mapped, mapping.currentSessionId, historyIds));
	}

	private async handleCreateSession(placeholderId: string | undefined, chatId: string, name?: string): Promise<void> {
		try {
			const session = await this.agent.createSession(undefined, name);
			const mapped: MappedSession = {
				id: session.id,
				name: session.name,
				cwd: (session as any).cwd,
				firstMessage: session.firstMessage,
				lastModified: session.lastModified,
				messageCount: session.messageCount,
			};

			this.mapper.setCurrentSession(chatId, session.id);
			this.mapper.addToHistory(chatId, mapped);
			this.closeWsConnection(chatId);

			await this.feishu.reply(placeholderId, chatId, formatSessionCreated(mapped));
		} catch (err) {
			this.logger.error("agent", "Failed to create session", {
				chatId,
				err: err instanceof Error ? { message: err.message, stack: err.stack } : String(err),
			});
			await this.feishu.reply(
				placeholderId,
				chatId,
				formatError(`创建会话失败: ${err instanceof Error ? err.message : String(err)}`),
			);
		}
	}

	private async handleSwitchSession(
		placeholderId: string | undefined,
		chatId: string,
		sessionId?: string,
		search?: string,
	): Promise<void> {
		const allSessions = await this.agent.listSessions();
		if (allSessions.length === 0) {
			await this.feishu.reply(placeholderId, chatId, "还没有任何会话。输入 /new 创建一个。");
			return;
		}

		const mapped: MappedSession[] = allSessions.map((s) => ({
			id: s.id,
			name: s.name,
			cwd: (s as any).cwd,
			firstMessage: s.firstMessage,
			lastModified: s.lastModified,
			messageCount: s.messageCount,
		}));

		let target: MappedSession | undefined;

		if (sessionId) {
			target = mapped.find((s) => s.id === sessionId);
		} else if (search) {
			const num = Number.parseInt(search, 10);
			if (!Number.isNaN(num) && num > 0 && num <= mapped.length) {
				target = mapped[num - 1];
			}
			if (!target) {
				target = findBestSession(mapped, search);
			}
		}

		if (!target) {
			await this.feishu.reply(placeholderId, chatId, `没有找到匹配的会话。\n\n${formatSessionListCompact(mapped)}`);
			return;
		}

		this.mapper.setCurrentSession(chatId, target.id);
		this.mapper.addToHistory(chatId, target);
		this.closeWsConnection(chatId);

		await this.feishu.reply(placeholderId, chatId, formatSessionSwitched(target));
	}

	private async handleContinue(placeholderId: string | undefined, chatId: string): Promise<void> {
		const mapping = this.mapper.getOrCreate(chatId);

		if (mapping.currentSessionId) {
			const session = await this.findSessionById(mapping.currentSessionId);
			if (session) {
				await this.feishu.reply(
					placeholderId,
					chatId,
					`继续会话 **${session.name || session.firstMessage || "(未命名)"}**\n\n继续发消息吧。`,
				);
				return;
			}
		}

		if (mapping.history.length > 0) {
			const last = mapping.history[0];
			const session = await this.findSessionById(last.id);
			if (session) {
				this.mapper.setCurrentSession(chatId, last.id);
				await this.feishu.reply(
					placeholderId,
					chatId,
					`已恢复上次的会话 **${session.name || session.firstMessage || "(未命名)"}**\n\n继续发消息吧。`,
				);
				return;
			}
		}

		await this.feishu.reply(placeholderId, chatId, formatNoSession());
	}

	// =========================================================================
	// Conversation handling
	// =========================================================================

	private async handleConversation(placeholderId: string | undefined, chatId: string, text: string): Promise<void> {
		const mapping = this.mapper.getOrCreate(chatId);
		let sessionId = mapping.currentSessionId;

		if (!sessionId) {
			if (mapping.history.length > 0) {
				sessionId = mapping.history[0].id;
				this.mapper.setCurrentSession(chatId, sessionId);
			} else {
				// Edit placeholder to show we're creating a session
				await this.feishu.reply(placeholderId, chatId, "📝 创建新会话中...");

				try {
					const session = await this.agent.createSession();
					sessionId = session.id;
					this.mapper.setCurrentSession(chatId, sessionId);
					const mapped: MappedSession = {
						id: session.id,
						name: session.name,
						firstMessage: session.firstMessage,
						lastModified: session.lastModified,
						messageCount: session.messageCount,
					};
					this.mapper.addToHistory(chatId, mapped);
				} catch (err) {
					this.logger.error("agent", "Failed to create session", {
						chatId,
						err: err instanceof Error ? { message: err.message, stack: err.stack } : String(err),
					});
					await this.feishu.reply(
						placeholderId,
						chatId,
						`创建会话失败，请确认 agent-server 正在运行。\n${err instanceof Error ? err.message : String(err)}`,
					);
					return;
				}
			}
		}

		if (!sessionId) {
			await this.feishu.reply(placeholderId, chatId, formatNoSession());
			return;
		}

		await this.sendToSession(placeholderId, chatId, sessionId, text);
	}

	// =========================================================================
	// WebSocket communication
	// =========================================================================

	private async sendToSession(
		placeholderId: string | undefined,
		chatId: string,
		sessionId: string,
		message: string,
	): Promise<void> {
		const wsKey = `${chatId}:${sessionId}`;
		let conn = this.wsConnections.get(wsKey);

		if (!conn || conn.ws.readyState !== WebSocket.OPEN) {
			conn = await this.createWsConnection(chatId, sessionId);
		}

		if (conn.isPrompting) {
			await this.feishu.reply(placeholderId, chatId, "⏳ 上一个请求还在处理中，请稍候...");
			return;
		}

		conn.textBuffer = "";
		conn.isPrompting = true;

		const reply = await new Promise<FilteredReply>((resolve, reject) => {
			conn!.pendingResolve = resolve;

			conn!.ws.send(JSON.stringify({ type: "prompt", message }));

			// Timeout after 5 minutes
			const _timeout = setTimeout(
				() => {
					if (conn!.isPrompting) {
						conn!.isPrompting = false;
						reject(new Error("响应超时"));
					}
				},
				5 * 60 * 1000,
			);
		});

		conn.isPrompting = false;
		conn.pendingResolve = undefined;

		if (reply.error) {
			await this.feishu.reply(placeholderId, chatId, formatError(reply.error));
		} else if (reply.aborted) {
			await this.feishu.reply(placeholderId, chatId, "⏹️ 已取消");
		} else {
			const formatted = formatAgentReply(reply.text);
			if (formatted) {
				await this.feishu.reply(placeholderId, chatId, formatted);
			}
		}
	}

	private async createWsConnection(chatId: string, sessionId: string): Promise<WsConnection> {
		const wsKey = `${chatId}:${sessionId}`;
		const wsUrl = `${this.config.agentServerUrl.replace(/^http/, "ws")}/ws/sessions/${sessionId}`;
		const ws = new WebSocket(wsUrl);

		const conn: WsConnection = {
			ws,
			sessionId,
			chatId,
			textBuffer: "",
			isPrompting: false,
			awaitingToolResults: false,
		};
		this.wsConnections.set(wsKey, conn);

		return new Promise<WsConnection>((resolve, reject) => {
			ws.onopen = () => {
				console.log(`[im-bot] WS connected: ${chatId} → session ${sessionId}`);
				resolve(conn);
			};

			ws.onmessage = (event) => {
				try {
					const msg = JSON.parse(event.data as string);
					this.handleWsEvent(conn, msg);
				} catch {
					// Ignore parse errors
				}
			};

			ws.onerror = () => {
				console.error(`[im-bot] WS error (${wsKey})`);
				this.logger.error("ws", "WebSocket error", { chatId, sessionId, wsKey });
				const pending = conn.pendingResolve;
				if (pending) {
					pending({ text: conn.textBuffer, error: "连接错误" });
					conn.pendingResolve = undefined;
					conn.isPrompting = false;
				}
			};

			ws.onclose = (_event: WebSocket.CloseEvent) => {
				console.log(`[im-bot] WS closed: ${wsKey}`);
				this.logger.warn("ws", "WebSocket closed", {
					chatId,
					sessionId,
					wsKey,
					code: _event.code,
					reason: _event.reason,
				});
				this.wsConnections.delete(wsKey);
				const pending = conn.pendingResolve;
				if (pending) {
					pending({ text: conn.textBuffer, error: "连接断开" });
					conn.pendingResolve = undefined;
					conn.isPrompting = false;
				}
			};

			setTimeout(() => {
				if (ws.readyState !== WebSocket.OPEN) {
					reject(new Error("连接 agent-server 超时"));
				}
			}, 10000);
		});
	}

	private handleWsEvent(conn: WsConnection, msg: Record<string, unknown>): void {
		switch (msg.type) {
			case "agent_start":
				conn.textBuffer = "";
				conn.awaitingToolResults = false;
				break;

			case "message_update": {
				const ev = (msg as unknown as { assistantMessageEvent?: { type?: string; delta?: string } })
					.assistantMessageEvent;
				if (ev?.type === "text_delta" && ev.delta) {
					conn.textBuffer += ev.delta;
				}
				break;
			}

			case "message_end": {
				const m = msg as unknown as {
					message?: {
						role?: string;
						stopReason?: string;
						errorMessage?: string;
					};
				};
				const message = m.message;

				// Only assistant messages carry stop signals
				if (message?.role !== "assistant") break;

				const stopReason = message.stopReason;

				if (stopReason === "stop" || stopReason === "length") {
					// Final result — resolve with accumulated text
					if (conn.pendingResolve) {
						conn.pendingResolve({ text: conn.textBuffer });
						conn.pendingResolve = undefined;
						conn.isPrompting = false;
						conn.awaitingToolResults = false;
					}
				} else if (stopReason === "toolUse") {
					// Agent called tools — keep buffer, wait for next assistant turn
					conn.awaitingToolResults = true;
				} else if (stopReason === "error" || stopReason === "aborted") {
					// Error or user cancellation
					if (conn.pendingResolve) {
						conn.pendingResolve({
							text: conn.textBuffer,
							error: message.errorMessage || (stopReason === "aborted" ? "已取消" : "处理出错"),
						});
						conn.pendingResolve = undefined;
						conn.isPrompting = false;
						conn.awaitingToolResults = false;
					}
				} else {
					// Unknown stopReason — treat as done
					if (conn.pendingResolve) {
						conn.pendingResolve({ text: conn.textBuffer });
						conn.pendingResolve = undefined;
						conn.isPrompting = false;
						conn.awaitingToolResults = false;
					}
				}
				break;
			}

			case "agent_end": {
				if (conn.pendingResolve) {
					if (conn.textBuffer) {
						conn.pendingResolve({ text: conn.textBuffer });
					} else {
						// Agent ended without producing text (thinking-only turn, etc.)
						conn.pendingResolve({ text: "已处理完毕" });
					}
					conn.pendingResolve = undefined;
					conn.isPrompting = false;
					conn.awaitingToolResults = false;
				}
				break;
			}

			case "auto_retry_start": {
				console.log(`[im-bot] Auto-retry: attempt ${(msg as unknown as { attempt?: number }).attempt}`);
				break;
			}

			case "auto_retry_end": {
				const retryEnd = msg as unknown as { success?: boolean; finalError?: string };
				if (!retryEnd.success && conn.pendingResolve) {
					conn.pendingResolve({
						text: conn.textBuffer,
						error: retryEnd.finalError || "所有重试均失败",
					});
					conn.pendingResolve = undefined;
					conn.isPrompting = false;
					conn.awaitingToolResults = false;
				}
				break;
			}

			case "response": {
				const response = msg as unknown as { command: string; success: boolean; error?: string };
				if (response.command === "prompt" && !response.success) {
					if (conn.pendingResolve) {
						conn.pendingResolve({ text: conn.textBuffer, error: response.error ?? "未知错误" });
						conn.pendingResolve = undefined;
						conn.isPrompting = false;
						conn.awaitingToolResults = false;
					}
				}
				break;
			}

			case "error": {
				if (conn.pendingResolve) {
					conn.pendingResolve({
						text: conn.textBuffer,
						error: (msg as unknown as { error?: string }).error ?? "未知错误",
					});
					conn.pendingResolve = undefined;
					conn.isPrompting = false;
					conn.awaitingToolResults = false;
				}
				break;
			}
		}
	}

	// =========================================================================
	// Helpers
	// =========================================================================

	private closeWsConnection(chatId: string): void {
		for (const [key, conn] of this.wsConnections) {
			if (conn.chatId === chatId) {
				conn.ws.close();
				this.wsConnections.delete(key);
			}
		}
	}

	private async findSessionById(sessionId: string): Promise<MappedSession | undefined> {
		try {
			const sessions = await this.agent.listSessions();
			const s = sessions.find((s) => s.id === sessionId);
			if (!s) return undefined;
			return {
				id: s.id,
				name: s.name,
				cwd: (s as any).cwd,
				firstMessage: s.firstMessage,
				lastModified: s.lastModified,
				messageCount: s.messageCount,
			};
		} catch {
			return undefined;
		}
	}
}
