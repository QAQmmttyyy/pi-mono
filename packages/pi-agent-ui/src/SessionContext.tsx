import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { getClient, SessionPoolClient } from "./client/SessionPoolClient.js";
import type {
	SessionInfo,
	SessionState,
	WsServerMessage,
	DisplayMessage,
	DisplayAssistantMessage,
	DisplayTool,
} from "./client/types.js";

interface SessionContextValue {
	client: SessionPoolClient;
	sessions: SessionInfo[];
	activeSessionId: string | null;
	state: SessionState | null;
	messages: DisplayMessage[];
	isStreaming: boolean;
	error: string | null;
	loadSessions: () => Promise<void>;
	attachToSession: (id: string) => Promise<void>;
	createAndAttach: (cwd?: string, name?: string) => Promise<void>;
	renameSession: (id: string, name: string) => Promise<void>;
	deleteSession: (id: string) => Promise<void>;
	sendPrompt: (message: string) => void;
	abortPrompt: () => void;
	sendCommand: (cmd: { type: string; [key: string]: unknown }) => void;
	availableModels: Array<{ provider: string; id: string; name?: string }>;
	loadModels: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession() {
	const ctx = useContext(SessionContext);
	if (!ctx) throw new Error("useSession must be used within SessionProvider");
	return ctx;
}

/** Helper: apply an update to the last assistant message in the list */
function updateLastAssistant(
	prev: DisplayMessage[],
	fn: (a: DisplayAssistantMessage) => DisplayAssistantMessage,
): DisplayMessage[] {
	const next = [...prev];
	const last = next[next.length - 1];
	if (last && last.role === "assistant") {
		next[next.length - 1] = fn(last as DisplayAssistantMessage);
	}
	return next;
}

function formatToolLabel(name: string, args: unknown): string {
	switch (name) {
		case "bash": {
			const a = args as { command?: string };
			return a.command ?? "bash";
		}
		case "read": {
			const a = args as { path?: string; offset?: number; limit?: number };
			let label = a.path ?? "read";
			if (a.offset != null || a.limit != null) {
				const start = a.offset ?? 1;
				const end = a.limit != null ? start + a.limit - 1 : "";
				label += `:${start}${end ? `-${end}` : ""}`;
			}
			return label;
		}
		case "edit": {
			const a = args as { path?: string; edits?: unknown[] };
			const editCount = a.edits?.length ?? 0;
			return `${a.path ?? "edit"}${editCount > 0 ? ` (${editCount} edit${editCount > 1 ? "s" : ""})` : ""}`;
		}
		case "write": {
			const a = args as { path?: string };
			return a.path ?? "write";
		}
		default:
			return name;
	}
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
	const [sessions, setSessions] = useState<SessionInfo[]>([]);
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
	const [state, setState] = useState<SessionState | null>(null);
	const [messages, setMessages] = useState<DisplayMessage[]>([]);
	const [isStreaming, setIsStreaming] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [availableModels, setAvailableModels] = useState<Array<{ provider: string; id: string; name?: string }>>([]);
	const clientRef = useRef(getClient());
	const client = clientRef.current;

	useEffect(() => { loadSessions(); }, []);

	const loadSessions = async () => {
		try {
			const list = await client.listSessions();
			setSessions(list);
		} catch (err) { setError(String(err)); }
	};

	const attachToSession = useCallback(async (id: string) => {
		if (id === activeSessionId) return;
		try {
			setError(null);
			if (activeSessionId) client.detach(activeSessionId);
			const result = await client.attach(id);
			setActiveSessionId(id);
			setState(result.state);
			const display: DisplayMessage[] = [];
			// Collect tool results to match with tool calls
			const toolResults = new Map<string, { output: string; isError: boolean }>();
			for (const msg of result.messages) {
				if (msg.role === "toolResult") {
					const tr = msg as any;
					const output = (tr.content as any[])?.map((c: any) => c.text ?? "").join("") ?? "";
					if (tr.toolCallId && output) toolResults.set(tr.toolCallId, { output, isError: tr.isError === true });
				}
			}
			for (const msg of result.messages) {
				const dm = agentMessageToDisplay(msg, toolResults);
				if (dm) display.push(...(Array.isArray(dm) ? dm : [dm]));
			}
			setMessages(display);
			client.on(id, handleWsMessage);
		} catch (err) { setError(String(err)); }
	}, [activeSessionId]);

	const createAndAttach = async (cwd?: string, name?: string) => {
		try {
			setError(null);
			const info = await client.createSession(cwd, name);
			await loadSessions();
			await attachToSession(info.id);
		} catch (err) { setError(String(err)); }
	};

	const renameSession = async (id: string, name: string) => {
		try { await client.renameSession(id, name); await loadSessions(); }
		catch (err) { setError(String(err)); }
	};

	const deleteSession = async (id: string) => {
		try {
			await client.deleteSession(id);
			if (activeSessionId === id) {
				client.detach(id);
				setActiveSessionId(null);
				setState(null);
				setMessages([]);
			}
			await loadSessions();
		} catch (err) { setError(String(err)); }
	};

	const sendPrompt = (message: string) => {
		if (!activeSessionId) return;
		client.send(activeSessionId, { type: "prompt", message });
	};

	const abortPrompt = () => {
		if (!activeSessionId) return;
		client.send(activeSessionId, { type: "abort" });
	};

	const sendCommand = (cmd: { type: string; [key: string]: unknown }) => {
		if (!activeSessionId) return;
		client.send(activeSessionId, cmd as any);
	};

	const loadModels = () => {
		if (!activeSessionId) return;
		client.send(activeSessionId, { type: "get_available_models" });
		const listener = (msg: WsServerMessage) => {
			if (msg.type === "response" && msg.command === "get_available_models" && msg.success) {
				setAvailableModels(((msg.data as any)?.models) ?? []);
				client.off(activeSessionId!, listener);
			}
		};
		client.on(activeSessionId, listener);
	};

	// Stable ref for WS handler to avoid stale closures in attachToSession
	const handleWsMessageRef = useRef((_msg: WsServerMessage) => {});

	const handleWsMessage = (msg: WsServerMessage) => {
		handleWsMessageRef.current(msg);
	};

	// The real handler — assigned to ref so attachToSession always gets latest
	handleWsMessageRef.current = (msg: WsServerMessage) => {
		if (msg.type === "agent_start") setIsStreaming(true);
		if (msg.type === "agent_end") { setIsStreaming(false); loadSessions(); }

		if (msg.type === "message_start") {
			const m = msg.message as AgentMessage;
			if (m.role === "user") {
				const dm = agentMessageToDisplay(m);
				if (dm) setMessages((prev) => [...prev, ...(Array.isArray(dm) ? dm : [dm])]);
			} else if (m.role === "assistant") {
				setMessages((prev) => [...prev, {
					id: (m as any).id ?? crypto.randomUUID(),
					role: "assistant", content: "", thinking: undefined, tools: [], timestamp: Date.now(),
				}]);
			}
		}

		if (msg.type === "message_update") {
			const ev = (msg.assistantMessageEvent ?? msg) as any;
			if (ev.type === "text_delta" && ev.delta) {
				setMessages((prev) => updateLastAssistant(prev, (a) => ({ ...a, content: a.content + ev.delta })));
			}
			if (ev.type === "thinking_delta" && ev.delta) {
				setMessages((prev) => updateLastAssistant(prev, (a) => ({
					...a,
					thinking: (a.thinking ?? "") + ev.delta,
				})));
			}
			// Create tool steps as soon as they appear in the partial message content,
			// matching TUI behavior that creates ToolExecutionComponent at first sighting.
			const partial = ev.partial;
			if (partial?.content) {
				setMessages((prev) => updateLastAssistant(prev, (a) => {
					const existingIds = new Set(a.tools.map((s) => s.id));
					const newTools = [...a.tools];
					for (const c of partial.content) {
						if (c.type === "toolCall" && !existingIds.has(c.id)) {
							newTools.push({
								id: c.id,  title: c.name,
								label: formatToolLabel(c.name, c.arguments),
								toolInput: c.arguments, status: "active" as const,
							});
						}
					}
					return newTools.length > a.tools.length ? { ...a, tools: newTools } : a;
				}));
			}
			// Also handle toolcall_end for final arguments update
			if (ev.type === "toolcall_end") {
				const tc = ev.toolCall as any;
				setMessages((prev) => updateLastAssistant(prev, (a) => ({
					...a,
					tools: a.tools.map((s) => s.id === tc.id ? {
						...s,
						label: formatToolLabel(tc.name, tc.arguments),
						toolInput: tc.arguments,
					} : s),
				})));
			}
		}

		if (msg.type === "tool_execution_start") {
			const ev = msg as any;
			setMessages((prev) => updateLastAssistant(prev, (a) => ({
				...a,
				tools: a.tools.map((s) => s.id === ev.toolCallId ? { ...s, status: "active" as const } : s),
			})));
		}

		if (msg.type === "tool_execution_end") {
			const ev = msg as any;
			const output = ev.result?.content?.map((c: any) => c.text ?? "").join("") ?? "";
			// Defer to next frame so the "active" state renders before transitioning to completed/error
			requestAnimationFrame(() => {
				setMessages((prev) => updateLastAssistant(prev, (a) => ({
					...a,
					tools: a.tools.map((s) => s.id === ev.toolCallId ? { ...s, toolOutput: output, toolIsError: ev.isError, status: ev.isError ? "error" as const : "completed" as const } : s),
				})));
			});
		}

		if (msg.type === "tool_execution_update") {
			const ev = msg as any;
			const partial = ev.partialResult?.content?.map((c: any) => c.text ?? "").join("") ?? "";
			if (partial) {
				setMessages((prev) => updateLastAssistant(prev, (a) => ({
					...a,
					tools: a.tools.map((s) => s.id === ev.toolCallId ? { ...s, toolOutput: partial } : s),
				})));
			}
		}

		if (msg.type === "message_end") {
			const m = msg.message as any;
			if (m.role === "assistant") {
				setMessages((prev) => updateLastAssistant(prev, (a) => ({
					...a,
					stopReason: m.stopReason,
					errorMessage: m.errorMessage,
				})));
			}
		}

		// Compaction notices
		if (msg.type === "compaction_start") {
			const ev = msg as any;
			setMessages((prev) => [...prev, {
				id: crypto.randomUUID(), role: "system" as const,
				content: ev.reason === "overflow" ? "Context limit reached, compacting..." : "Compacting conversation...",
				level: "info" as const, timestamp: Date.now(),
			}]);
		}
		if (msg.type === "compaction_end") {
			const ev = msg as any;
			const status = ev.aborted ? "aborted" : ev.result ? "done" : "failed";
			const msg_text = status === "done" ? "Compaction complete" : status === "aborted" ? "Compaction aborted" : `Compaction failed: ${ev.errorMessage || "unknown error"}`;
			setMessages((prev) => [...prev, {
				id: crypto.randomUUID(), role: "system" as const,
				content: msg_text,
				level: status === "done" ? "info" as const : "warning" as const,
				timestamp: Date.now(),
			}]);
		}

		// Auto-retry notices
		if (msg.type === "auto_retry_start") {
			const ev = msg as any;
			setMessages((prev) => [...prev, {
				id: crypto.randomUUID(), role: "system" as const,
				content: `Retrying (attempt ${ev.attempt}/${ev.maxAttempts})...`,
				level: "info" as const, timestamp: Date.now(),
			}]);
		}
		if (msg.type === "auto_retry_end") {
			const ev = msg as any;
			if (!ev.success) {
				setMessages((prev) => [...prev, {
					id: crypto.randomUUID(), role: "system" as const,
					content: ev.finalError ? `Retry failed: ${ev.finalError}` : "All retries exhausted",
					level: "error" as const, timestamp: Date.now(),
				}]);
			}
		}

		if (msg.type === "response" && msg.command === "get_state" && msg.success) {
			setState(msg.data as SessionState);
		}

		if (msg.type === "response" && msg.command === "set_thinking_level" && msg.success) {
			if (activeSessionId) client.send(activeSessionId, { type: "get_state" });
		}
	};

	return (
		<SessionContext.Provider value={{
			client, sessions, activeSessionId, state, messages, isStreaming, error,
			loadSessions, attachToSession, createAndAttach, renameSession, deleteSession,
			sendPrompt, abortPrompt, sendCommand, availableModels, loadModels,
		}}>
			{children}
		</SessionContext.Provider>
	);
}

// ============================================================================
// AgentMessage → DisplayMessage
// ============================================================================

function agentMessageToDisplay(msg: AgentMessage, toolResults?: Map<string, { output: string; isError: boolean }>): DisplayMessage | DisplayMessage[] | null {
	if (msg.role === "user") {
		const content = typeof msg.content === "string" ? msg.content
			: (msg.content as any[])?.filter((c) => c.type === "text").map((c) => c.text).join("") ?? "";
		return { id: (msg as any).id ?? crypto.randomUUID(), role: "user", content, timestamp: (msg as any).timestamp ?? Date.now() };
	}
	if (msg.role === "assistant") {
		const content = (msg.content as any[])?.filter((c: any) => c.type === "text").map((c: any) => c.text).join("") ?? "";
		const thinking = (msg.content as any[])?.filter((c: any) => c.type === "thinking").map((c: any) => c.thinking).join("\n") || undefined;
		const tools: DisplayTool[] = [];
		for (const c of (msg.content as any[])) {
			if (c.type === "toolCall") {
				const tr = toolResults?.get(c.id);
				tools.push({
					id: c.id, title: c.name,
					label: formatToolLabel(c.name, c.arguments),
					toolInput: c.arguments,
					status: tr?.isError ? "error" as const : "completed" as const,
					toolOutput: tr?.output,
				});
			}
		}
		return {
			id: (msg as any).id ?? crypto.randomUUID(), role: "assistant", content, thinking, tools,
			stopReason: (msg as any).stopReason, timestamp: (msg as any).timestamp ?? Date.now(),
		};
	}
	return null;
}
