/**
 * Server configuration.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Configuration for the agent server */
export interface AgentServerConfig {
	/** Root workspace directory - all session cwds must be under this path */
	rootWorkspace: string;
	/** HTTP port for REST API and WebSocket */
	port: number;
	/** Bind address */
	host: string;
	/** Directory for server-specific data (auth, settings) */
	agentDir: string;
	/** Idle timeout in ms before unloading inactive sessions from memory (default: 30 min) */
	idleUnloadMs: number;
}

/** Default configuration values */
const DEFAULT_CONFIG: AgentServerConfig = {
	rootWorkspace: join(homedir(), "pi-agent-server-workspace"),
	port: 3000,
	host: "127.0.0.1",
	agentDir: join(homedir(), ".pi", "agent-server"),
	idleUnloadMs: 30 * 60 * 1000,
};

function getConfigPath(agentDir: string): string {
	return join(agentDir, "server-config.json");
}

/** Load server config from disk or create default */
export function loadConfig(overrides?: Partial<AgentServerConfig>): AgentServerConfig {
	const agentDir = overrides?.agentDir ?? DEFAULT_CONFIG.agentDir;
	const configPath = getConfigPath(agentDir);

	let savedConfig: Partial<AgentServerConfig> = {};
	if (existsSync(configPath)) {
		try {
			savedConfig = JSON.parse(readFileSync(configPath, "utf8"));
		} catch {
			// Use defaults if config file is corrupt
		}
	}

	const config: AgentServerConfig = {
		...DEFAULT_CONFIG,
		...savedConfig,
		...overrides,
	};

	// Ensure agent directory exists
	if (!existsSync(config.agentDir)) {
		mkdirSync(config.agentDir, { recursive: true });
	}

	// Ensure root workspace exists
	if (!existsSync(config.rootWorkspace)) {
		mkdirSync(config.rootWorkspace, { recursive: true });
	}

	return config;
}

/** Persist server config to disk */
export function saveConfig(config: AgentServerConfig): void {
	if (!existsSync(config.agentDir)) {
		mkdirSync(config.agentDir, { recursive: true });
	}
	const configPath = getConfigPath(config.agentDir);
	writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}
