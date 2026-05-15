/**
 * Feishu adapter — wraps the Lark SDK (createLarkChannel) for sending
 * and receiving messages via WebSocket transport.
 *
 * The LarkChannel with WebSocket transport handles:
 * - Persistent WebSocket connection to Feishu servers
 * - Event subscription (message events)
 * - Auto-reconnection
 */

import {
	createLarkChannel,
	type LarkChannel,
	type LarkChannelError,
	LoggerLevel,
	type NormalizedMessage,
} from "@larksuiteoapi/node-sdk";
import type { BotConfig } from "./types.js";

const PROCESSING_TEXT = "⏳";

export interface FeishuAdapterEvents {
	/** Called when a message is received from a Feishu chat */
	onMessage: (msg: NormalizedMessage) => Promise<void>;
	/** Called when an error occurs */
	onError: (err: Error) => void;
	/** Called when the bot is added to a new chat */
	onBotAdded?: (chatId: string) => Promise<void>;
	/** Called when connection state changes */
	onConnectionChange?: (connected: boolean) => void;
}

/**
 * Adapter for Feishu/Lark bot communication.
 *
 * Uses WebSocket transport (no public webhook URL needed).
 * The bot connects to Feishu's servers and receives events in real-time.
 */
export class FeishuAdapter {
	private channel: LarkChannel | undefined;
	private config: BotConfig;
	private events: FeishuAdapterEvents;
	private connected = false;

	constructor(config: BotConfig, events: FeishuAdapterEvents) {
		this.config = config;
		this.events = events;
	}

	/** Start the Feishu bot connection */
	async start(): Promise<void> {
		const options = {
			appId: this.config.feishuAppId,
			appSecret: this.config.feishuAppSecret,
			transport: "websocket" as const,
			loggerLevel: LoggerLevel.info,
			includeRawEvent: true,
		};

		this.channel = createLarkChannel(options);

		// Register message handler
		this.channel.on("message", (msg: NormalizedMessage) => {
			const handler = this.events.onMessage(msg);
			if (handler instanceof Promise) {
				handler.catch((err: unknown) => {
					console.error("[feishu-adapter] Error handling message:", err);
				});
			}
		});

		// Register bot added handler
		this.channel.on("botAdded", (evt) => {
			console.log(`[feishu-adapter] Bot added to chat: ${evt.chatId}`);
			const handler = this.events.onBotAdded?.(evt.chatId);
			if (handler instanceof Promise) {
				handler.catch((err: unknown) => {
					console.error("[feishu-adapter] Error handling botAdded:", err);
				});
			}
		});

		// Register error handler
		this.channel.on("error", (err: LarkChannelError) => {
			console.error("[feishu-adapter] Channel error:", err);
			this.connected = false;
			this.events.onError(err);
		});

		// Register reconnection handlers
		this.channel.on("reconnecting", () => {
			console.log("[feishu-adapter] Reconnecting...");
			this.connected = false;
			this.events.onConnectionChange?.(false);
		});

		this.channel.on("reconnected", () => {
			console.log("[feishu-adapter] Reconnected");
			this.connected = true;
			this.events.onConnectionChange?.(true);
		});

		// Establish WebSocket connection to Feishu
		// Without this, createLarkChannel only constructs the object
		// and the process may exit immediately after start() resolves
		try {
			await this.channel.connect();
			this.connected = true;
			this.events.onConnectionChange?.(true);
			console.log("[feishu-adapter] WebSocket connected to Feishu");
		} catch (err) {
			console.error("[feishu-adapter] Failed to connect to Feishu:", err);
			throw err;
		}
	}

	/** Send a text message to a Feishu chat. Returns messageId for editing. */
	async sendText(chatId: string, text: string): Promise<string | undefined> {
		if (!this.channel) {
			console.error("[feishu-adapter] Cannot send: not connected");
			return undefined;
		}
		try {
			const result = await this.channel.send(chatId, { text });
			return result.messageId;
		} catch (err) {
			console.error("[feishu-adapter] Failed to send message:", err);
			throw err;
		}
	}

	/**
	 * Send a placeholder processing message.
	 * Returns the messageId so the caller can edit it later with the actual reply.
	 */
	async sendPlaceholder(chatId: string): Promise<string | undefined> {
		return this.sendText(chatId, PROCESSING_TEXT);
	}

	/** Edit an already-sent text message with new content */
	async editMessage(messageId: string, text: string): Promise<void> {
		if (!this.channel) {
			console.error("[feishu-adapter] Cannot edit: not connected");
			return;
		}
		try {
			await this.channel.editMessage(messageId, text);
		} catch (err) {
			console.error("[feishu-adapter] Failed to edit message:", err);
			throw err;
		}
	}

	/** Replace a placeholder message with final content */
	async reply(placeholderId: string | undefined, chatId: string, text: string): Promise<void> {
		if (placeholderId) {
			try {
				await this.editMessage(placeholderId, text);
				return;
			} catch {
				// If edit fails (e.g. timeout), fall through to send new
			}
		}
		await this.sendText(chatId, text);
	}

	/** Send a markdown message to a Feishu chat */
	async sendMarkdown(chatId: string, markdown: string): Promise<void> {
		if (!this.channel) {
			console.error("[feishu-adapter] Cannot send: not connected");
			return;
		}
		try {
			await this.channel.send(chatId, { markdown });
		} catch (err) {
			console.error("[feishu-adapter] Failed to send markdown:", err);
			throw err;
		}
	}

	/** Get the LarkChannel instance (for advanced usage) */
	getChannel(): LarkChannel | undefined {
		return this.channel;
	}

	/** Check if connected */
	isConnected(): boolean {
		return this.connected;
	}
}
