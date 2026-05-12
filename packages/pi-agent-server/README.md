# pi-agent-server

Persistent local agent server managing multiple independent agent sessions, with support for desktop, browser, and IM client connections. Sessions persist to disk as JSONL files and can be resumed across client sessions — similar to tmux for coding agents.

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [REST API](#rest-api)
  - [Sessions](#sessions)
  - [CWD Path Rules](#cwd-path-rules)
- [WebSocket Protocol](#websocket-protocol)
  - [Connection](#connection)
  - [Client → Server Commands](#client--server-commands)
  - [Server → Client Events](#server--client-events)
- [SDK Usage](#sdk-usage)
- [IM Adapters](#im-adapters)

## Quick Start

```bash
npm install @mariozechner/pi-agent-server
```

```typescript
import { startServer } from "@mariozechner/pi-agent-server";

const { shutdown, config } = await startServer({
  port: 3000,
});

console.log(`Server at http://localhost:${config.port}`);

// Graceful shutdown
process.on("SIGINT", () => shutdown());
```

The server auto-discovers available models via your configured credentials (same as pi). Ensure you have an API key configured:

```bash
# Set an API key (same as pi CLI)
pi login openrouter   # or: anthropic, openai, open-ai-compatible, etc.
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 Agent Server                     │
│                                                  │
│  REST API (:3000/api)     WebSocket              │
│  • Session CRUD           (:3000/ws/sessions/:id) │
│                            • Real-time events     │
│                            • Command dispatch     │
│                                                  │
│  SessionPool                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Session A │  │ Session B │  │ Session C │       │
│  │ (active)  │  │ (active)  │  │ (idle)    │       │
│  │ 2 clients │  │ 1 client  │  │ unloaded  │       │
│  └──────────┘  └──────────┘  └──────────┘       │
└─────────────────────────────────────────────────┘
```

Key concepts:

| Concept | Description |
|---------|-------------|
| **Default CWD** | Default working directory `~/pi-agent-server-workspace` for sessions with no explicit cwd |
| **Session** | An independent `AgentSession` with its own cwd, model, history. No cwd boundary — any directory works. |
| **Lazy load** | Sessions load from disk on demand when a client attaches |
| **External change detection** | Attach checks session file mtime; if modified externally (e.g. by TUI), reloads from disk automatically |
| **Idle unload** | Sessions unload from memory after 30 min with no subscribers |
| **Serialized prompts** | Per-session message queue ensures ordered prompt execution |
| **Multi-client broadcast** | All agent events fan out to every attached WebSocket client |

## Configuration

```typescript
interface AgentServerConfig {
  /** Default cwd for new sessions when none is specified.
   *  Default: ~/pi-agent-server-workspace */
  defaultCwd: string;

  /** HTTP port for REST API and WebSocket. Default: 3000 */
  port: number;

  /** Bind address. Default: "127.0.0.1" */
  host: string;

  /** Server-specific data directory. Default: ~/.pi/agent-server */
  agentDir: string;

  /** Idle timeout in ms before unloading inactive sessions. Default: 1800000 (30 min) */
  idleUnloadMs: number;
}
```

Config is persisted to `<agentDir>/server-config.json`. On restart, the last used config is loaded automatically. Pass overrides to `startServer()` to change settings at runtime.

## REST API

### Sessions

#### `GET /api/sessions`

List all sessions (active + on-disk). Sorted by last modified descending.

**Response** `200`:
```json
[
  {
    "id": "019e01d4-5b05-77ad-a20f-e0a677722965",
    "cwd": "/home/user/projects/my-app",
    "name": "my-session",
    "lastModified": "2026-05-06T10:30:00.000Z",
    "messageCount": 42,
    "firstMessage": "帮我分析这段代码",
    "isActive": true,
    "subscriberCount": 2
  }
]
```

- `isActive`: `true` when session is loaded in memory
- `subscriberCount`: number of connected WebSocket clients
- `firstMessage`: first user message text (used as fallback display title when no name set)

#### `POST /api/sessions`

Create a new session.

**Body**:
```json
{
  "cwd": "/home/user/projects/my-app",
  "name": "my-session"
}
```

- `cwd` (optional): absolute path. `~` is expanded. Empty → uses `defaultCwd`. See [CWD Path Rules](#cwd-path-rules).
- `name` (optional): display name (appended as `session_info` entry)

**Response** `201`: Session info object (see above).

**Errors**: `400` if cwd is not absolute or directory does not exist.

#### `GET /api/sessions/:id`

Get session detail. Returns real-time state for active sessions, disk metadata for inactive ones.

**Response** `200` (active session):
```json
{
  "model": { "id": "claude-sonnet-4-5", "provider": "anthropic", ... },
  "thinkingLevel": "medium",
  "isStreaming": false,
  "isCompacting": false,
  "steeringMode": "all",
  "followUpMode": "all",
  "sessionId": "019e...",
  "sessionName": "my-session",
  "autoCompactionEnabled": true,
  "messageCount": 42,
  "pendingMessageCount": 0
}
```

#### `DELETE /api/sessions/:id`

Delete session from memory and disk.

**Response** `200`: `{ "ok": true }`

#### `PATCH /api/sessions/:id/name`

Rename a session.

**Body**: `{ "name": "new-name" }`

**Response** `200`: Updated session info.

### CWD Path Rules

| Input | Behavior |
|-------|----------|
| Empty / undefined | Uses `defaultCwd` (`~/pi-agent-server-workspace`) |
| Starts with `/` | Used directly; directory must exist on disk |
| Starts with `~/` | `~` expanded to home directory, then validated as absolute |
| Relative / other | Rejected — `400: must be absolute` |

## WebSocket Protocol

### Connection

```
ws://localhost:3000/ws/sessions/:id
```

On connect, the server checks if the session file has been externally modified (e.g., by TUI writing new messages). If so, it reloads from disk before sending state. Then it sends the session state and full message history. Clients render this as initial context, then subscribe to live events.

If the session is not yet in memory, it is lazy-loaded from its JSONL file on disk.

### Client → Server Commands

All commands follow the `RpcCommand` type from `@mariozechner/pi-coding-agent`. Each command receives an `{ type: "response", command, success, ... }` acknowledgement.

| Command | Fields | Description |
|---------|--------|-------------|
| `prompt` | `message: string` | Send a user prompt (serialized per session) |
| `abort` | — | Abort current streaming response |
| `get_messages` | — | Get full message history |
| `get_state` | — | Get current session state |
| `set_model` | `provider: string`, `modelId: string` | Switch to a different model |
| `cycle_model` | `direction?: "forward" \| "backward"` | Cycle through available models |
| `get_available_models` | — | List all models with configured auth |
| `set_thinking_level` | `level: "off" \| "minimal" \| "low" \| "medium" \| "high"` | Set thinking/reasoning depth |
| `cycle_thinking_level` | — | Cycle through available levels |
| `set_steering_mode` | `mode: "all" \| "one-at-a-time"` | Steering message delivery mode |
| `set_follow_up_mode` | `mode: "all" \| "one-at-a-time"` | Follow-up message delivery mode |
| `compact` | `customInstructions?: string` | Manually compact session context |
| `set_auto_compaction` | `enabled: boolean` | Enable/disable auto compaction |
| `set_auto_retry` | `enabled: boolean` | Enable/disable auto retry on errors |
| `bash` | `command: string` | Execute a bash command in session cwd |
| `get_session_stats` | — | Get token/cost/message statistics |
| `export_html` | `outputPath?: string` | Export session to HTML file |
| `get_fork_messages` | — | Get user messages for forking |
| `get_last_assistant_text` | — | Get text of last assistant message |

**Example — sending a prompt:**
```json
{ "type": "prompt", "message": "Help me refactor this function" }
```

**Response:**
```json
{ "type": "response", "command": "prompt", "success": true }
```

Streaming content follows as `message_update` events (see below).

### Server → Client Events

All events from `AgentSessionEvent` are broadcast in real time to every attached client.

| Event | Description |
|-------|-------------|
| `agent_start` | A new agent turn has started |
| `message_start` | A new message (user, assistant, tool) begins |
| `message_update` | Streaming delta for the current message (`assistantMessageEvent`) |
| `message_end` | Final state of a completed message |
| `tool_execution_start` | A tool call is about to execute |
| `tool_execution_update` | Partial result from a running tool |
| `tool_execution_end` | Tool execution completed |
| `turn_start` / `turn_end` | Turn boundaries within an agent run |
| `agent_end` | Agent turn completed |
| `compaction_start` | Compaction has started (manual, threshold, overflow) |
| `compaction_end` | Compaction completed or aborted |
| `thinking_level_changed` | Thinking level changed |
| `queue_update` | Steering/follow-up queue changed |
| `session_info_changed` | Session name changed |
| `auto_retry_start` / `auto_retry_end` | Auto retry lifecycle |

**Example — streaming response:**
```json
{ "type": "message_start", "message": { "role": "assistant", "content": [] } }
{ "type": "message_update", "assistantMessageEvent": { "type": "text_delta", "delta": "好的" } }
{ "type": "message_update", "assistantMessageEvent": { "type": "text_delta", "delta": "，让我" } }
{ "type": "message_end", "message": { "role": "assistant", "content": [{ "type": "text", "text": "好的，让我..." }], "usage": { ... } } }
```

## SDK Usage

The server exposes the `SessionPool` class for programmatic use without starting an HTTP server:

```typescript
import { SessionPool } from "@mariozechner/pi-agent-server";

const pool = new SessionPool({
  defaultCwd: "/home/user",
  port: 3000,
  host: "127.0.0.1",
  agentDir: "~/.pi/agent-server",
  idleUnloadMs: 30 * 60 * 1000,
});

// Create a session
const session = await pool.createSession(
  "/home/user/projects/my-app",
  "my-session",
);

// Send a prompt
await pool.enqueueMessage(session.id, "Analyze this codebase");

// Attach an event listener
const active = pool.getActiveSession(session.id)!;
const unsub = active.agentSession.subscribe((event) => {
  if (event.type === "message_update") {
    console.log(event.assistantMessageEvent);
  }
});

// List all sessions
const sessions = await pool.listSessions();

// Check for external changes (e.g., TUI wrote to the same session)
await pool.refreshIfStale(session.id);

// Cleanup
await pool.shutdown();
```

## IM Adapters

To integrate with messaging platforms (Slack, Telegram, WeChat), implement an adapter that connects to the server via WebSocket. The adapter acts as a regular client — no special privileges needed.

```typescript
import WebSocket from "ws";

// 1. Create session via REST
const res = await fetch("http://localhost:3000/api/sessions", {
  method: "POST",
  body: JSON.stringify({ name: "slack-thread-123" }),
});
const { id } = await res.json();

// 2. Attach via WebSocket
const ws = new WebSocket(`ws://localhost:3000/ws/sessions/${id}`);

ws.on("message", (data) => {
  const event = JSON.parse(data.toString());
  if (event.type === "message_update") {
    // Stream delta to IM channel
  }
  if (event.type === "message_end" && event.message.role === "assistant") {
    // Send final response to IM channel
  }
});

// 3. Forward user message
ws.send(JSON.stringify({ type: "prompt", message: userMessage }));
```
