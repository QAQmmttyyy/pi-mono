/**
 * Smoke test: starts the pi-agent-server and verifies REST API endpoints respond correctly.
 * Uses a temp workspace directory so it doesn't touch real data.
 *
 * Run: npx tsx test/smoke.ts
 */

import { mkdtempSync, rmSync } from "node:fs";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleApiRequest } from "../src/api/sessions.js";
import type { AgentServerConfig } from "../src/config.js";
import { SessionPool } from "../src/session-pool.js";

// Create temp directory for workspace
const tmpDir = mkdtempSync(join(tmpdir(), "pi-agent-server-smoke-"));
const agentDir = join(tmpDir, ".pi-agent-server");

const config: AgentServerConfig = {
	defaultCwd: tmpDir,
	port: 0,
	host: "127.0.0.1",
	agentDir,
	idleUnloadMs: 60_000,
};

async function httpRequest(
	server: ReturnType<typeof createServer>,
	method: string,
	path: string,
	body?: unknown,
): Promise<{ status: number; data: unknown }> {
	return new Promise((resolve, reject) => {
		const url = new URL(path, "http://127.0.0.1");
		const port = (server.address() as { port: number }).port;
		const req = request(
			{
				hostname: "127.0.0.1",
				port,
				path: url.pathname,
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
						// keep as string
					}
					resolve({ status: res.statusCode ?? 0, data });
				});
			},
		);
		req.on("error", reject);
		if (body) {
			req.write(JSON.stringify(body));
		}
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

	// Test 1: List sessions (empty)
	await test("GET /api/sessions (empty)", async () => {
		const { status, data } = await httpRequest(server, "GET", "/api/sessions");
		if (status !== 200) throw new Error(`Expected 200, got ${status}`);
		const sessions = data as Array<unknown>;
		if (!Array.isArray(sessions)) throw new Error("Expected array");
		if (sessions.length !== 0) throw new Error(`Expected 0 sessions, got ${sessions.length}`);
	});

	// Test 2: Create session
	let sessionId = "";
	await test("POST /api/sessions", async () => {
		const { status, data } = await httpRequest(server, "POST", "/api/sessions", { name: "test-session" });
		if (status !== 201) throw new Error(`Expected 201, got ${status}`);
		const session = data as { id: string; name?: string; isActive: boolean };
		if (!session.id) throw new Error("Missing session id");
		if (session.name !== "test-session") throw new Error(`Expected name test-session, got ${session.name}`);
		if (!session.isActive) throw new Error("Expected session to be active");
		sessionId = session.id;
		console.log(`    Created session: ${sessionId}`);
	});

	// Test 3: Get session detail
	await test("GET /api/sessions/:id", async () => {
		const { status, data } = await httpRequest(server, "GET", `/api/sessions/${sessionId}`);
		if (status !== 200) throw new Error(`Expected 200, got ${status}`);
		const state = data as { sessionId: string; sessionName?: string };
		if (state.sessionId !== sessionId) throw new Error(`Expected ${sessionId}, got ${state.sessionId}`);
		if (state.sessionName !== "test-session") throw new Error(`Expected name test-session, got ${state.sessionName}`);
	});

	// Test 4: Rename session
	await test("PATCH /api/sessions/:id/name", async () => {
		const { status, data } = await httpRequest(server, "PATCH", `/api/sessions/${sessionId}/name`, {
			name: "renamed",
		});
		if (status !== 200) throw new Error(`Expected 200, got ${status}`);
		const info = data as { name?: string };
		if (info.name !== "renamed") throw new Error(`Expected renamed, got ${info.name}`);
	});

	// Test 5: List sessions (has one)
	await test("GET /api/sessions (with data)", async () => {
		const { status, data } = await httpRequest(server, "GET", "/api/sessions");
		if (status !== 200) throw new Error(`Expected 200, got ${status}`);
		const sessions = data as Array<{ id: string }>;
		if (sessions.length !== 1) throw new Error(`Expected 1 session, got ${sessions.length}`);
		if (sessions[0].id !== sessionId) throw new Error(`Wrong session id`);
	});

	// Test 6: Workspace tree
	await test("GET /api/workspace", async () => {
		const { status, data } = await httpRequest(server, "GET", "/api/workspace");
		if (status !== 200) throw new Error(`Expected 200, got ${status}`);
		const tree = data as Array<{ name: string }>;
		if (!Array.isArray(tree)) throw new Error("Expected array");
	});

	// Test 7: CORS preflight
	await test("OPTIONS (CORS preflight)", async () => {
		const { status } = await httpRequest(server, "OPTIONS", "/api/sessions");
		if (status !== 204) throw new Error(`Expected 204, got ${status}`);
	});

	// Test 8: 404
	await test("GET /api/nonexistent (404)", async () => {
		const { status } = await httpRequest(server, "GET", "/api/nonexistent");
		if (status !== 404) throw new Error(`Expected 404, got ${status}`);
	});

	// Test 9: Delete session
	await test("DELETE /api/sessions/:id", async () => {
		const { status } = await httpRequest(server, "DELETE", `/api/sessions/${sessionId}`);
		if (status !== 200) throw new Error(`Expected 200, got ${status}`);
		// Verify gone
		const { data } = await httpRequest(server, "GET", "/api/sessions");
		const sessions = data as Array<unknown>;
		if (sessions.length !== 0) throw new Error(`Expected 0 sessions after delete, got ${sessions.length}`);
	});

	// Cleanup
	await pool.shutdown();
	server.close();
	rmSync(tmpDir, { recursive: true, force: true });

	console.log(`\n${passed} passed, ${failed} failed`);
	process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error("Fatal:", err);
	process.exit(1);
});
