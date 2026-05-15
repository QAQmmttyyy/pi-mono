#!/usr/bin/env node
/**
 * feishu-bot — Feishu bot for pi-agent-server.
 *
 * Runs as a standalone process that connects to agent-server and Feishu,
 * providing a natural-language interface to manage and converse with
 * AI agent sessions.
 *
 * Usage:
 *   feishu-bot
 *   feishu-bot --app-id cli_xxx --app-secret xxx
 *
 * See `feishu-bot --help` for full options.
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import { IMBot } from "./im-bot.js";

const PID_FILE = join(process.env.HOME ?? process.cwd(), ".pi", "feishu-bot", "bot.pid");

function checkPidFile(): void {
	try {
		if (!existsSync(PID_FILE)) return;
		const existing = readFileSync(PID_FILE, "utf8").trim();
		const pid = Number.parseInt(existing, 10);
		if (pid && Number.isFinite(pid)) {
			try {
				// Check if the process is still alive
				process.kill(pid, 0);
				console.error(`❌ Bot already running (PID ${pid}).`);
				console.error(`   Remove ${PID_FILE} if stuck.`);
				process.exit(1);
			} catch {
				// Process not running, stale PID file
				unlinkSync(PID_FILE);
			}
		}
	} catch {
		// No PID file, OK
	}
}

function writePidFile(): void {
	writeFileSync(PID_FILE, String(process.pid), "utf8");
}

function cleanup(): void {
	try {
		unlinkSync(PID_FILE);
	} catch {
		// Ignore
	}
}

async function main(): Promise<void> {
	checkPidFile();
	writePidFile();

	const config = loadConfig();

	console.log("╔══════════════════════════════════════════╗");
	console.log("║   Feishu Bot for pi-agent-server         ║");
	console.log("╚══════════════════════════════════════════╝");
	console.log(`  Agent server: ${config.agentServerUrl}`);
	console.log(`  Data dir:     ${config.dataDir}`);

	if (!config.feishuAppId || !config.feishuAppSecret) {
		console.error("\n❌ Feishu bot credentials not configured.");
		console.error("   Set FEISHU_BOT_APP_ID and FEISHU_BOT_APP_SECRET");
		console.error("   or create ~/.pi/feishu-bot/config.json with:  ");
		console.error('   { "feishuAppId": "cli_xxx", "feishuAppSecret": "xxx" }');
		console.error("\n   Or use CLI args: --app-id cli_xxx --app-secret xxx");
		console.error("\n   See --help for details.");
		process.exit(1);
	}

	const bot = new IMBot(config);

	// Handle graceful shutdown — remove PID file
	const shutdown = async () => {
		console.log("\n[feishu-bot] Shutting down...");
		cleanup();
		process.exit(0);
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);

	try {
		await bot.start();
		console.log("✅ Bot is running. Press Ctrl+C to stop.");
		// Keep the process alive indefinitely.
		// The Lark WebSocket connection holds an event-loop handle,
		// so this promise never resolves but Node won't exit.
		await new Promise<void>(() => {});
	} catch (err) {
		cleanup();
		console.error("❌ Failed to start bot:", err);
		process.exit(1);
	}
}

main();
