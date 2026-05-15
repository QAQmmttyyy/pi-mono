/**
 * JSONL logger for feishu-bot.
 *
 * Writes structured log entries to a JSONL file for easy debugging
 * and monitoring. Each line is a JSON object, making it simple to
 * tail, grep, and parse.
 *
 * Log file: ~/.pi/feishu-bot/bot.jsonl
 */

import { appendFileSync, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
	timestamp: string;
	level: LogLevel;
	type: string;
	message: string;
	details?: unknown;
}

export class JsonlLogger {
	private filePath: string;
	private ready = false;

	constructor(dataDir: string) {
		this.filePath = join(dataDir, "log.jsonl");
	}

	async init(): Promise<void> {
		if (!existsSync(this.filePath)) {
			await mkdir(join(this.filePath, ".."), { recursive: true });
		}
		this.ready = true;
	}

	private write(level: LogLevel, type: string, message: string, details?: unknown): void {
		if (!this.ready) return;
		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level,
			type,
			message,
		};
		if (details !== undefined) {
			entry.details = details;
		}
		try {
			appendFileSync(this.filePath, `${JSON.stringify(entry)}\n`, "utf8");
		} catch {
			// Fail silently — logging should never crash the bot
		}
	}

	info(type: string, message: string, details?: unknown): void {
		this.write("info", type, message, details);
	}

	warn(type: string, message: string, details?: unknown): void {
		this.write("warn", type, message, details);
	}

	error(type: string, message: string, details?: unknown): void {
		this.write("error", type, message, details);
		if (details instanceof Error) {
			this.write("error", type, details.stack ?? "No stack trace");
		}
	}

	debug(type: string, message: string, details?: unknown): void {
		this.write("debug", type, message, details);
	}
}
