/**
 * session-history — injects session JSONL query instructions and entry type
 * guidance into the system prompt.
 */

import { join } from "node:path";
import { homedir } from "node:os";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

function getSessionsRoot(): string {
  const envDir = process.env["PI_CODING_AGENT_DIR"];
  const base = envDir
    ? envDir.replace(/^~(?=$|\/)/, process.env.HOME ?? "~")
    : join(homedir(), ".pi", "agent");
  return join(base, "sessions");
}

export default function (pi: ExtensionAPI) {
  const globalSessionsDir = getSessionsRoot();

  pi.on("before_agent_start", async (event, ctx) => {
    const sessionDir = ctx.sessionManager.getSessionDir();
    if (!sessionDir) return;

    const currentFile = ctx.sessionManager.getSessionFile();

    const lines = [
      "## Agent Session files Queries (for older history)",
      "",
      "Session files are JSONL: a header line followed by entries. They store all user-agent conversation content. Install jq for structured queries (system-appropriate package manager).",
      "",
      "### Locations",
      `- Global Roots:   ${globalSessionsDir}/`,
      `- This Project:   ${sessionDir}/`,
      `- Active File:    ${currentFile || "(ephemeral)"}`,
      "  (Exclude results from the active file when searching for *historical* context)",
      "",
      "### Entry Types",
      "| type | value |",
      "|------|-------|",
      "| `message` role `user`/`assistant` | core conversation text |",
      "| `compaction` | LLM-generated summary of earlier messages — **highest information density** |",
      "| `branch_summary` | LLM summary of an abandoned branch |",
      "| `message` role `toolResult` | raw tool output — large, query on demand |",
      "| `session_info` | session display name |",
      "| `model_change`/`thinking_level_change`/`custom` | metadata, skip |",
    ];
    const block = lines.join("\n");

    return { systemPrompt: event.systemPrompt + "\n\n" + block };
  });
}
