# feishu-bot — Feishu bot for pi-agent-server

Connects Feishu (飞书) to pi-agent-server, allowing you to manage and converse
with AI agent sessions directly from Feishu chat. Seamless cross-device
experience — start in Feishu on your phone, continue in agent-ui on your
desktop.

## Architecture

```
Feishu User ──► Feishu ──WebSocket──► feishu-bot ──REST/WS──► agent-server
                    │                    │                        │
                    │                    ├─ session-mapper        ├─ SessionPool
                    │                    ├─ event-filter          └─ AgentSessions
                    │                    └─ intent-engine
                    │
                    ◄── Feishu API ──────┘
```

- **feishu-bot**: standalone Node.js process, runs alongside agent-server
- **WebSocket transport**: connects to Feishu servers directly (no public
  webhook URL needed)
- **No changes to agent-server**: uses existing REST API + WebSocket protocol
- **Session mapping**: persists Feishu chat ↔ agent session mappings locally

## Features

- Natural language session management: "看看我的会话", "切换到登录那个"
- Slash commands: `/list`, `/new`, `/switch`, `/continue`, `/help`
- Event filtering: only final text responses shown, no thinking/tool details
- Session auto-creation on first message
- Multiple Feishu chats, each with independent session context
- Seamless cross-device: sessions created via Feishu are visible in agent-ui

## Prerequisites

1. pi-agent-server running (default: http://localhost:3000)
2. A Feishu app with bot capability enabled
3. Feishu app credentials (App ID, App Secret)

### Feishu App Setup

1. Go to [Feishu Open Platform](https://open.feishu.cn)
2. Create an app (or use existing)
3. Enable **Bot** capability
4. In **Permissions → API**:
   - `im:message` — read messages
   - `im:message:send_as_bot` — send messages as bot
5. In **Event Subscription**:
   - Set transport to **WebSocket** (no webhook URL needed)
   - Subscribe to `im.message.receive_v1`
6. Publish the app
7. Add the bot to a chat

## Installation

```bash
# From the monorepo root
npm install
npm run build -w @mariozechner/feishu-bot
```

## Configuration

Create `~/.pi/feishu-bot/config.json`:

```json
{
  "feishuAppId": "cli_xxxxxxxxxxxxxx",
  "feishuAppSecret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "agentServerUrl": "http://localhost:3000"
}
```

Or use environment variables:

```bash
export FEISHU_BOT_APP_ID=cli_xxxxxxxxxxxxxx
export FEISHU_BOT_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
export FEISHU_BOT_AGENT_URL=http://localhost:3000
```

## Usage

### 1. Start agent-server

```bash
npx pi-agent-server --port 3000
```

### 2. Start feishu-bot

```bash
# From monorepo root:
npx tsx packages/feishu-bot/src/index.ts

# Or after build:
node packages/feishu-bot/dist/index.js

# Or globally:
feishu-bot
```

### 3. Chat with the bot in Feishu

Send any message to the bot. First-time users get an auto-created session.
Use slash commands or natural language for session management:

| What you say | What happens |
|---|---|
| `显示我的会话` / `/list` | Lists all sessions |
| `新建会话` / `/new` | Creates a new session |
| `切换到登录那个` / `/switch 1` | Switches to a session |
| `继续` / `/continue` | Resumes last session |
| `帮我分析这段代码` | Sends to current session |

## Related

- [pi-agent-server](../pi-agent-server) — the agent server backend
- [pi-agent-ui](../pi-agent-ui) — web UI for the agent server
