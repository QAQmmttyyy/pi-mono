/**
 * Configuration loader for feishu-bot.
 *
 * Reads config from:
 * 1. Defaults
 * 2. `~/.pi/feishu-bot/config.json`
 * 3. Environment variables (FEISHU_BOT_*)
 * 4. CLI arguments
 */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { BotConfig } from "./types.js";

const DEFAULT_DATA_DIR = join(homedir(), ".pi", "feishu-bot");
const DEFAULT_CONFIG_PATH = join(DEFAULT_DATA_DIR, "config.json");

const DEFAULTS: Omit<BotConfig, "feishuAppId" | "feishuAppSecret"> = {
	agentServerUrl: "http://localhost:3000",
	dataDir: DEFAULT_DATA_DIR,
	webhookPort: 3002,
};

function loadFromFile(path: string): Partial<BotConfig> {
	try {
		if (existsSync(path)) {
			const raw = readFileSync(path, "utf8");
			return JSON.parse(raw);
		}
	} catch {
		// Ignore corrupt config files
	}
	return {};
}

function loadFromEnv(): Partial<BotConfig> {
	const env = process.env;
	return {
		...(env.FEISHU_BOT_AGENT_URL ? { agentServerUrl: env.FEISHU_BOT_AGENT_URL } : {}),
		...(env.FEISHU_BOT_APP_ID ? { feishuAppId: env.FEISHU_BOT_APP_ID } : {}),
		...(env.FEISHU_BOT_APP_SECRET ? { feishuAppSecret: env.FEISHU_BOT_APP_SECRET } : {}),
		...(env.FEISHU_BOT_DATA_DIR ? { dataDir: env.FEISHU_BOT_DATA_DIR } : {}),
		...(env.FEISHU_BOT_WEBHOOK_PORT ? { webhookPort: Number.parseInt(env.FEISHU_BOT_WEBHOOK_PORT, 10) } : {}),
	};
}

function loadFromArgs(): Partial<BotConfig> {
	const args = process.argv.slice(2);
	const cfg: Partial<BotConfig> = {};
	for (let i = 0; i < args.length; i++) {
		switch (args[i]) {
			case "--agent-url":
			case "-u":
				cfg.agentServerUrl = args[++i];
				break;
			case "--app-id":
				cfg.feishuAppId = args[++i];
				break;
			case "--app-secret":
				cfg.feishuAppSecret = args[++i];
				break;
			case "--data-dir":
				cfg.dataDir = args[++i];
				break;
			case "--webhook-port":
				cfg.webhookPort = Number.parseInt(args[++i], 10);
				break;
			case "--help":
			case "-h":
				printHelp();
				process.exit(0);
		}
	}
	return cfg;
}

function printHelp(): void {
	console.log(`
feishu-bot — Feishu bot for pi-agent-server

Usage:
  feishu-bot [options]

Options:
  --agent-url, -u   <url>     Agent server URL (default: http://localhost:3000)
  --app-id          <id>      Feishu app ID (required, or env FEISHU_BOT_APP_ID)
  --app-secret      <secret>  Feishu app secret (required, or env FEISHU_BOT_APP_SECRET)
  --data-dir        <dir>     Data directory (default: ~/.pi/feishu-bot)
  --webhook-port    <port>    Webhook server port (default: 3002)
  --help, -h                  Show this help

Environment variables:
  FEISHU_BOT_AGENT_URL
  FEISHU_BOT_APP_ID
  FEISHU_BOT_APP_SECRET
  FEISHU_BOT_DATA_DIR
  FEISHU_BOT_WEBHOOK_PORT

Config file: ~/.pi/feishu-bot/config.json
Priority: CLI args > env vars > config file > defaults
`);
}

export function loadConfig(overrides?: Partial<BotConfig>): BotConfig {
	const fileConfig = loadFromFile(DEFAULT_CONFIG_PATH);
	const envConfig = loadFromEnv();
	const argConfig = loadFromArgs();

	const config = {
		...DEFAULTS,
		...fileConfig,
		...envConfig,
		...argConfig,
		...overrides,
	} as BotConfig;

	// Ensure data directory exists
	if (!existsSync(config.dataDir)) {
		mkdirSync(config.dataDir, { recursive: true });
	}

	return config;
}
