/**
 * memory — reads MEMORY.md from global (~/.pi/agent/MEMORY.md) and project
 * (.pi/MEMORY.md), injects contents into system prompt.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

function getMemory(cwd: string): string {
  const parts: string[] = [];
  const globalPath = join(homedir(), ".pi", "agent", "MEMORY.md");
  const projectPath = join(cwd, ".pi", "MEMORY.md");

  if (existsSync(globalPath)) {
    const content = readFileSync(globalPath, "utf-8").trim();
    if (content) parts.push(`### Global Memory\n${content}`);
  }
  if (existsSync(projectPath)) {
    const content = readFileSync(projectPath, "utf-8").trim();
    if (content) parts.push(`### Project Memory\n${content}`);
  }
  return parts.length > 0 ? parts.join("\n\n") : "(no memory yet)";
}

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    const cwd = ctx.cwd;
    const memoryContent = getMemory(cwd);

    const block = `## Memory
Write to MEMORY.md files to persist context across sessions.
- Global (~/.pi/agent/MEMORY.md): coding habits, preferences, cross-project knowledge
- Project (${cwd}/.pi/MEMORY.md): architecture decisions, ongoing work, project conventions
Update when you learn something important or when asked to remember something.

### Current Memory
${memoryContent}`;

    return { systemPrompt: event.systemPrompt + "\n\n" + block };
  });
}
