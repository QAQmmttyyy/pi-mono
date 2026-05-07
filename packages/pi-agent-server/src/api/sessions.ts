/**
 * REST API for session management.
 *
 * Routes:
 *   GET    /api/sessions         - list all sessions
 *   POST   /api/sessions         - create a new session
 *   GET    /api/sessions/:id     - get session detail
 *   DELETE /api/sessions/:id     - delete session
 *   PATCH  /api/sessions/:id/name - rename session
 *   GET    /api/workspace        - get workspace tree
 *
 * Uses Node.js built-in http module.
 */

import type { ServerResponse as HttpServerResponse, IncomingMessage } from "node:http";
import type { SessionPool } from "../session-pool.js";

type RouteHandler = (req: IncomingMessage, res: HttpServerResponse, params: Record<string, string>) => Promise<void>;

interface Route {
	method: string;
	pattern: RegExp;
	handler: RouteHandler;
}

class Router {
	private routes: Route[] = [];

	add(method: string, path: string, handler: RouteHandler): void {
		// Convert /:param to regex groups
		const pattern = new RegExp(`^${path.replace(/:([^/]+)/g, "(?<$1>[^/]+)")}$`);
		this.routes.push({ method, pattern, handler });
	}

	async handle(req: IncomingMessage, res: HttpServerResponse): Promise<boolean> {
		const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
		const path = url.pathname;
		const method = req.method ?? "GET";

		for (const route of this.routes) {
			if (route.method !== method) continue;
			const match = path.match(route.pattern);
			if (!match) continue;
			const params = match.groups ?? {};
			await route.handler(req, res, params);
			return true;
		}

		return false;
	}
}

/** Helper to parse JSON body from incoming request */
function parseBody(req: IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on("data", (chunk: Buffer) => chunks.push(chunk));
		req.on("end", () => {
			const raw = Buffer.concat(chunks).toString("utf8");
			if (!raw.trim()) {
				resolve(undefined);
				return;
			}
			try {
				resolve(JSON.parse(raw));
			} catch {
				reject(new Error("Invalid JSON body"));
			}
		});
		req.on("error", reject);
	});
}

/** Helper to send JSON response */
function json(res: HttpServerResponse, status: number, data: unknown): void {
	res.writeHead(status, {
		"Content-Type": "application/json",
		"Access-Control-Allow-Origin": "*",
	});
	res.end(JSON.stringify(data));
}

/** Helper to send error response */
function error(res: HttpServerResponse, status: number, message: string): void {
	json(res, status, { error: message });
}

/** Helper to set CORS headers and handle preflight */
function handleCors(req: IncomingMessage, res: HttpServerResponse): boolean {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");
	if (req.method === "OPTIONS") {
		res.writeHead(204);
		res.end();
		return true;
	}
	return false;
}

/** Create the session REST API router */
export function createSessionRouter(pool: SessionPool): Router {
	const router = new Router();

	// GET /api/sessions - list all sessions
	router.add("GET", "/api/sessions", async (_req, res) => {
		try {
			const sessions = await pool.listSessions();
			json(res, 200, sessions);
		} catch (err) {
			error(res, 500, String(err));
		}
	});

	// POST /api/sessions - create a new session
	router.add("POST", "/api/sessions", async (req, res) => {
		try {
			const body = (await parseBody(req)) as { cwd?: string; name?: string } | undefined;
			const session = await pool.createSession(body?.cwd, body?.name);
			json(res, 201, session);
		} catch (err) {
			const message = String(err);
			const status = message.includes("must be under rootWorkspace") ? 400 : 500;
			error(res, status, message);
		}
	});

	// GET /api/sessions/:id - get session detail
	router.add("GET", "/api/sessions/:id", async (_req, res, params) => {
		try {
			const active = pool.getActiveSession(params.id);
			if (!active) {
				// Check disk
				const sessions = await pool.listSessions();
				const info = sessions.find((s) => s.id === params.id);
				if (!info) {
					error(res, 404, `Session ${params.id} not found`);
					return;
				}
				json(res, 200, info);
				return;
			}
			// Get state from active session
			const state = pool.getState(params.id);
			json(res, 200, state);
		} catch (err) {
			error(res, 500, String(err));
		}
	});

	// DELETE /api/sessions/:id - delete session
	router.add("DELETE", "/api/sessions/:id", async (_req, res, params) => {
		try {
			await pool.deleteSession(params.id);
			json(res, 200, { ok: true });
		} catch (err) {
			error(res, 500, String(err));
		}
	});

	// PATCH /api/sessions/:id/name - rename session
	router.add("PATCH", "/api/sessions/:id/name", async (req, res, params) => {
		try {
			const body = (await parseBody(req)) as { name: string };
			if (!body?.name) {
				error(res, 400, "Missing 'name' in body");
				return;
			}
			const info = await pool.renameSession(params.id, body.name);
			json(res, 200, info);
		} catch (err) {
			const message = String(err);
			const status = message.includes("not found") ? 404 : 500;
			error(res, status, message);
		}
	});

	return router;
}

/** Create the workspace API router */
export function createWorkspaceRouter(pool: SessionPool): Router {
	const router = new Router();

	// GET /api/workspace - get workspace tree
	router.add("GET", "/api/workspace", async (_req, res) => {
		try {
			const tree = await pool.getWorkspaceTree();
			json(res, 200, tree);
		} catch (err) {
			error(res, 500, String(err));
		}
	});

	return router;
}

/** Handle REST API request */
export async function handleApiRequest(
	pool: SessionPool,
	req: IncomingMessage,
	res: HttpServerResponse,
): Promise<boolean> {
	if (handleCors(req, res)) return true;

	const routers = [createSessionRouter(pool), createWorkspaceRouter(pool)];
	for (const router of routers) {
		const handled = await router.handle(req, res);
		if (handled) return true;
	}

	return false;
}
