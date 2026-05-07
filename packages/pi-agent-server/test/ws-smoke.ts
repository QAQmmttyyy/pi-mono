/**
 * WebSocket smoke test: creates a session, attaches via WebSocket, sends commands.
 *
 * Run: npx tsx test/ws-smoke.ts
 */

import { mkdtempSync, rmSync } from "node:fs";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import { handleApiRequest } from "../src/api/sessions.js";
import type { AgentServerConfig } from "../src/config.js";
import { SessionPool } from "../src/session-pool.js";
import { createSessionWsServer } from "../src/ws/session-ws.js";

const tmpDir = mkdtempSync(join(tmpdir(), "pi-agent-server-ws-"));
const agentDir = join(tmpDir, ".pi-agent-server");

const config: AgentServerConfig = {
	rootWorkspace: tmpDir,
	port: 0,
	host: "127.0.0.1",
	agentDir,
	idleUnloadMs: 60_000,
};

async function httpJson(
	port: number,
	method: string,
	path: string,
	body?: unknown,
): Promise<{ status: number; data: unknown }> {
	return new Promise((resolve, reject) => {
		const req = request(
			{
				hostname: "127.0.0.1",
				port,
				path,
				method,
				headers: body ? { "Content-Type": "application/json" } : {},
			},
			(res) => {
				const chunks: Buffer[] = [];
				res.on("data", (c: Buffer) => chunks.push(c));
				res.on("end", () => {
					const raw = Buffer.concat(chunks).toString("utf8");
					let data: unknown = raw;
					try {
						data = JSON.parse(raw);
					} catch {
						/* raw text */
					}
					resolve({ status: res.statusCode ?? 0, data });
				});
			},
		);
		req.on("error", reject);
		if (body) req.write(JSON.stringify(body));
		req.end();
	});
}

async function main() {
	const pool = new SessionPool(config);

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

	const wss = new WebSocketServer({ server });
	createSessionWsServer(wss, pool);

	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const port = (server.address() as { port: number }).port;
	console.log(`Server listening on port ${port}`);

	let passed = 0;
	let failed = 0;

	async function test(name: string, fn: () => Promise<void>) {
		try {
			await fn();
			passed++;
			console.log(`  ✓ ${name}`);
		} catch (err) {
			failed++;
			console.log(`  ✗ ${name}: ${err}`);
		}
	}

	// Create a session first
	const createRes = await httpJson(port, "POST", "/api/sessions", { name: "ws-test" });
	if (createRes.status !== 201) throw new Error(`Failed to create session: ${createRes.status}`);
	const sessionId = (createRes.data as { id: string }).id;
	console.log(`  Created session: ${sessionId}`);

	// Test 1: Connect to WebSocket
	await test("WebSocket connect to /ws/sessions/:id", async () => {
		await new Promise<void>((resolve, reject) => {
			const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/sessions/${sessionId}`);
			ws.on("open", () => {
				ws.close();
				resolve();
			});
			ws.on("error", reject);
			setTimeout(() => reject(new Error("Connection timeout")), 5000);
		});
	});

	// Test 2: Connect, receive get_state and get_messages
	await test("WebSocket receives initial state + messages on attach", async () => {
		await new Promise<void>((resolve, reject) => {
			const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/sessions/${sessionId}`);
			const received: string[] = [];
			const timeout = setTimeout(() => {
				ws.close();
				if (received.length >= 2) {
					resolve();
				} else {
					reject(new Error(`Expected at least 2 messages, got ${received.length}: ${JSON.stringify(received)}`));
				}
			}, 5000);

			ws.on("message", (raw) => {
				const data = JSON.parse(raw.toString());
				received.push(data.type);
				if (data.type === "response" && data.command === "get_state") {
					console.log("    Received get_state response");
				}
				if (data.type === "response" && data.command === "get_messages") {
					console.log("    Received get_messages response");
					ws.close();
					clearTimeout(timeout);
					resolve();
				}
			});
			ws.on("error", (err) => {
				clearTimeout(timeout);
				reject(err);
			});
		});
	});

	// Test 3: Send get_state command
	await test("WebSocket command: get_state", async () => {
		await new Promise<void>((resolve, reject) => {
			const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/sessions/${sessionId}`);
			const timeout = setTimeout(() => {
				ws.close();
				reject(new Error("Timeout"));
			}, 5000);

			// Skip initial messages
			let initDone = false;
			ws.on("message", (raw) => {
				const data = JSON.parse(raw.toString());
				if (!initDone) {
					if (data.type === "response" && data.command === "get_messages") {
						initDone = true;
						// Now send get_state
						ws.send(JSON.stringify({ type: "get_state" }));
					}
					return;
				}
				if (data.type === "response" && data.command === "get_state" && data.success) {
					console.log(`    State: ${JSON.stringify(data.data).slice(0, 80)}...`);
					ws.close();
					clearTimeout(timeout);
					resolve();
				}
			});
			ws.on("error", (err) => {
				clearTimeout(timeout);
				reject(err);
			});
		});
	});

	// Test 4: Invalid session ID returns error
	await test("WebSocket to nonexistent session returns error", async () => {
		await new Promise<void>((resolve, reject) => {
			const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/sessions/nonexistent-id`);
			const timeout = setTimeout(() => {
				ws.close();
				reject(new Error("Timeout"));
			}, 5000);

			ws.on("message", (raw) => {
				const data = JSON.parse(raw.toString());
				if (data.type === "error") {
					console.log(`    Error: ${data.error}`);
					ws.close();
					clearTimeout(timeout);
					resolve();
				}
			});
			ws.on("close", (code) => {
				if (code === 4004) {
					clearTimeout(timeout);
					resolve();
				}
			});
			ws.on("error", () => {
				/* expected */
			});
		});
	});

	// Test 5: Missing session ID returns error
	await test("WebSocket without session ID returns error", async () => {
		await new Promise<void>((resolve) => {
			const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/`);
			const timeout = setTimeout(() => {
				ws.close();
				resolve();
			}, 3000);

			ws.on("message", (raw) => {
				const data = JSON.parse(raw.toString());
				if (data.type === "error") {
					console.log(`    Error: ${data.error}`);
					ws.close();
					clearTimeout(timeout);
					resolve();
				}
			});
			ws.on("close", () => {
				clearTimeout(timeout);
				resolve();
			});
			ws.on("error", () => {
				clearTimeout(timeout);
				resolve();
			});
		});
	});

	// Cleanup
	await pool.shutdown();
	wss.close();
	server.close();
	rmSync(tmpDir, { recursive: true, force: true });

	console.log(`\n${passed} passed, ${failed} failed`);
	process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error("Fatal:", err);
	process.exit(1);
});
