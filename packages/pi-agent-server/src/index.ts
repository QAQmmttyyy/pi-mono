/**
 * pi-agent-server: Persistent local agent server.
 *
 * Manages multiple independent agent sessions, supporting multiple
 * client connections (desktop, browser, IM adapters) that can
 * attach/detach from sessions (similar to tmux).
 *
 * Usage:
 *   import { startServer } from '@mariozechner/pi-agent-server';
 *   await startServer({ port: 3000 });
 *
 * Or via CLI:
 *   npx pi-agent-server --port 3000
 */

import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { handleApiRequest } from "./api/sessions.js";
import { type AgentServerConfig, loadConfig } from "./config.js";
import { SessionPool } from "./session-pool.js";
import { createSessionWsServer } from "./ws/session-ws.js";

export type { AgentServerConfig } from "./config.js";
export { loadConfig } from "./config.js";
export type { ActiveSession, BashExecResult, SessionInfo } from "./session-pool.js";
export { SessionPool } from "./session-pool.js";

/**
 * Start the agent server.
 *
 * @param configOverride Optional overrides for server configuration
 * @returns Cleanup function to shut down the server
 */
export async function startServer(
	configOverride?: Partial<AgentServerConfig>,
): Promise<{ shutdown: () => Promise<void>; config: AgentServerConfig }> {
	const config = loadConfig(configOverride);
	const pool = new SessionPool(config);

	// Create HTTP server
	const server = createServer((req, res) => {
		handleApiRequest(pool, req, res)
			.then((handled) => {
				if (!handled) {
					res.writeHead(404, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Not found" }));
				}
			})
			.catch((err) => {
				res.writeHead(500, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: String(err) }));
			});
	});

	// Create WebSocket server on top of HTTP
	const wss = new WebSocketServer({ server });
	createSessionWsServer(wss, pool);

	// Start listening
	return new Promise((resolve, reject) => {
		server.listen(config.port, config.host, () => {
			console.log(`[pi-agent-server] Listening on http://${config.host}:${config.port}`);
			console.log(`[pi-agent-server] Default cwd: ${config.defaultCwd}`);
			console.log(`[pi-agent-server] Agent dir: ${config.agentDir}`);

			resolve({
				config,
				shutdown: async () => {
					console.log("[pi-agent-server] Shutting down...");
					await pool.shutdown();
					wss.close();
					server.close();
				},
			});
		});

		server.on("error", reject);
	});
}
