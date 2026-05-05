/**
 * session-context — agent-level cross-session historical memory.
 *
 * Injects session file access guidance into the system prompt before each
 * agent turn. The agent discovers, searches, and reads past session JSONL
 * files using its existing bash/read tools.
 */

import { join } from "node:path";
import { homedir } from "node:os";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * Standard location for all project sessions.
 */
function getDefaultSessionsRoot(): string {
	const appName = "PI"; // APP_NAME defaults to "pi" -> PI_CODING_AGENT_DIR
	const envDir = process.env[`${appName}_CODING_AGENT_DIR`];
	const base = envDir
		? envDir.replace(/^~(?=$|\/)/, process.env.HOME ?? "~")
		: join(homedir(), ".pi", "agent");
	return join(base, "sessions");
}

export default function (pi: ExtensionAPI) {
	// Suggestion 5: Pre-calculate static root
	const sessionsRoot = getDefaultSessionsRoot();

	pi.on("before_agent_start", async (event, ctx) => {
		// Suggestion 1: Use the real project session dir (respects --session-dir)
		const projectDir = ctx.sessionManager.getSessionDir();
		if (!projectDir) return;

		// Suggestion 2: Identify current file to avoid "self-reflection" loops
		const currentFile = ctx.sessionManager.getSessionFile();

		const block = `
## Session History (Cross-Session Memory)

You have access to all past session files. Use them to understand prior decisions and context.

### Locations
- Global Roots:   ${sessionsRoot}/
- This Project:   ${projectDir}/
- Active File:    ${currentFile || "(ephemeral)"}
  (Exclude results from the active file when searching for *historical* context)

### Schema (JSONL)
- Header: {"type":"session", "cwd":"...", ...}
- Entry:  {"type":"...", "id":"...", "parentId":"...", "timestamp":"...", ...}

### Key Entry Types
- "message"        .message.role ∈ {user, assistant, toolResult, bashExecution, custom, branchSummary, compactionSummary}
- "compaction"     .summary (context compression summary)
- "branch_summary"  .summary, .fromId (abandoned branch context)
- "label"          .targetId, .label (human-marked decision points)
- "model_change"   .provider, .modelId
- "thinking_level_change"  .thinkingLevel
- "custom"         .customType, .data (extension state, not LLM context)
- "custom_message" .customType, .content, .display (extension-injected context)
- "session_info"   .name (user-set session name)

### Access Guidance
- **Discovery**: Use \`grep -r "keyword" ${sessionsRoot}\` to locate relevant sessions across all projects.
- **Precision**: Use \`jq\` for structured extraction. 
- **Escaping**: Shell quoting for complex \`jq\` commands is difficult. If a query fails, write the JQ script to a temporary file first and use \`jq -f script.jq session.jsonl\`.
- **Install jq**: If missing, use \`brew install jq\` (macOS) or \`apt install jq\` (Linux).

### jq Examples
- Overview: \`jq -r 'select(.type=="compaction") | "[" + .timestamp + "] " + .summary[0:500]' <file>\`
- Search:   \`jq 'select(.type=="message") | select(.message.content | tostring | test("keyword";"i"))' <file>\`
- History:  \`jq -r 'select(.type=="message" and .message.role=="user") | "[\(.timestamp)] \((.message.content[0].text // .message.content)[0:500])"' <file>\`
`;

		return { systemPrompt: event.systemPrompt + "\n" + block };
	});
}
