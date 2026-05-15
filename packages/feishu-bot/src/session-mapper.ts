/**
 * Session mapper — persists the mapping between Feishu chats and agent sessions.
 *
 * Storage: ~/.pi/feishu-bot/session-mappings.json
 */

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChatSessionMapping, MappedSession, SessionMappings } from "./types.js";

export class SessionMapper {
	private mappings: SessionMappings = {};
	private filePath: string;
	private saveTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(dataDir: string) {
		this.filePath = join(dataDir, "session-mappings.json");
	}

	/** Load mappings from disk */
	async load(): Promise<void> {
		try {
			if (existsSync(this.filePath)) {
				const raw = await readFile(this.filePath, "utf8");
				this.mappings = JSON.parse(raw);
			}
		} catch {
			// Start fresh if file is corrupt
			this.mappings = {};
		}
	}

	/** Save mappings to disk (debounced) */
	private scheduleSave(): void {
		if (this.saveTimer) clearTimeout(this.saveTimer);
		this.saveTimer = setTimeout(() => {
			this.saveTimer = undefined;
			this.saveSync();
		}, 200);
	}

	private async saveSync(): Promise<void> {
		try {
			await writeFile(this.filePath, JSON.stringify(this.mappings, null, 2), "utf8");
		} catch (err) {
			console.error("[session-mapper] Failed to save mappings:", err);
		}
	}

	/** Get mapping for a chat, creating a default if not found */
	getOrCreate(chatId: string): ChatSessionMapping {
		if (!this.mappings[chatId]) {
			const now = new Date().toISOString();
			this.mappings[chatId] = {
				currentSessionId: null,
				history: [],
				createdAt: now,
				updatedAt: now,
			};
			this.scheduleSave();
		}
		return this.mappings[chatId];
	}

	/** Get mapping for a chat, or undefined */
	get(chatId: string): ChatSessionMapping | undefined {
		return this.mappings[chatId];
	}

	/** Set the current session for a chat */
	setCurrentSession(chatId: string, sessionId: string): void {
		const mapping = this.getOrCreate(chatId);
		mapping.currentSessionId = sessionId;
		mapping.updatedAt = new Date().toISOString();
		this.scheduleSave();
	}

	/** Clear the current session for a chat */
	clearCurrentSession(chatId: string): void {
		const mapping = this.getOrCreate(chatId);
		mapping.currentSessionId = null;
		mapping.updatedAt = new Date().toISOString();
		this.scheduleSave();
	}

	/** Add a session to the chat's history (updates if exists) */
	addToHistory(chatId: string, session: MappedSession): void {
		const mapping = this.getOrCreate(chatId);
		const idx = mapping.history.findIndex((s) => s.id === session.id);
		const entry = {
			id: session.id,
			name: session.name,
			firstMessage: session.firstMessage,
			lastActive: session.lastModified,
		};
		if (idx >= 0) {
			mapping.history[idx] = { ...mapping.history[idx], ...entry };
		} else {
			mapping.history.push(entry);
		}
		mapping.updatedAt = new Date().toISOString();
		this.scheduleSave();
	}

	/** Remove a session from chat's history */
	removeFromHistory(chatId: string, sessionId: string): void {
		const mapping = this.mappings[chatId];
		if (!mapping) return;
		mapping.history = mapping.history.filter((s) => s.id !== sessionId);
		if (mapping.currentSessionId === sessionId) {
			mapping.currentSessionId = null;
		}
		mapping.updatedAt = new Date().toISOString();
		this.scheduleSave();
	}

	/** Get the current session ID for a chat */
	getCurrentSessionId(chatId: string): string | null {
		return this.mappings[chatId]?.currentSessionId ?? null;
	}

	/** Get the chat's session history */
	getHistory(chatId: string): ChatSessionMapping["history"] {
		return this.mappings[chatId]?.history ?? [];
	}

	/** Get all chat IDs that have mappings */
	getAllChatIds(): string[] {
		return Object.keys(this.mappings);
	}
}
