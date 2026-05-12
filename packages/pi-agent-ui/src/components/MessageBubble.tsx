import { useMemo } from "react";
import type { DisplayMessage, DisplayAssistantMessage, DisplayCompactionSummary } from "../client/types.js";
import { cn } from "../utils/cn.js";
import { Reasoning, ReasoningTrigger, ReasoningContent } from "./ui/reasoning.js";
import { Markdown } from "./ui/markdown.js";
import { CodeBlock, CodeBlockCode } from "./ui/code-block.js";
import { Message } from "./ui/message.js";
import { ToolCard } from "./ToolCard.js";
import { CompactionSummary } from "./CompactionSummary.js";
import { useTheme } from "./ThemeProvider.js";

interface Props {
	msg: DisplayMessage;
}

export function MessageBubble({ msg }: Props) {
	if (msg.role === "system") {
		return (
			<div className={cn(
				"text-center text-xs px-3 py-1.5 rounded-md border",
				msg.level === "error"
					? "bg-destructive/10 text-destructive border-destructive/20"
					: "bg-muted text-muted-foreground border-border",
			)}>
				{msg.content}
			</div>
		);
	}

	if (msg.role === "user") {
		return (
			<Message className="justify-end">
				<div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md text-sm px-4 py-2 whitespace-pre-wrap break-words">
					{msg.content}
				</div>
			</Message>
		);
	}

	if (msg.role === "compactionSummary") {
		const c = msg as DisplayCompactionSummary;
		return <CompactionSummary summary={c.summary} tokensBefore={c.tokensBefore} />;
	}

	const asst = msg as DisplayAssistantMessage;
	const isStreaming = !asst.stopReason;
	const { theme } = useTheme();

	const components = useMemo(() => ({
		code: ({ className: codeCls, children: codeChildren, ...codeProps }: any) => {
			const isInline =
				!codeProps.node?.position?.start.line ||
				codeProps.node?.position?.start.line === codeProps.node?.position?.end.line;
			if (isInline) {
				return (
					<span className="bg-primary-foreground rounded-sm px-1 font-mono text-sm" {...codeProps}>
						{codeChildren}
					</span>
				);
			}
			const lang = codeCls ? (codeCls.match(/language-(\w+)/)?.[1] || "plaintext") : "plaintext";
			return (
				<CodeBlock>
					<CodeBlockCode code={codeChildren as string} language={lang} theme={theme === "dark" ? "github-dark" : "github-light"} />
				</CodeBlock>
			);
		},
		pre: ({ children: preChildren }: any) => <>{preChildren}</>,
	}), [theme]);

	return (
		<div className="space-y-3">
			{asst.thinking && (
				<Reasoning isStreaming={isStreaming && asst.content === ""}>
					<ReasoningTrigger className="text-xs text-muted-foreground">
						{asst.content || asst.stopReason ? "Thought" : "Thinking"}
					</ReasoningTrigger>
					<ReasoningContent contentClassName="text-xs">
						<Markdown key={`t-${theme}`} components={components}>{asst.thinking}</Markdown>
					</ReasoningContent>
				</Reasoning>
			)}

			{asst.content && (
				<div className="prose prose-sm dark:prose-invert">
					<Markdown key={`c-${theme}`} components={components}>{asst.content}</Markdown>
				</div>
			)}

			{asst.tools.map((tool) => (
				<ToolCard key={tool.id} step={tool} />
			))}

			{/* Stop reason notices */}
			{asst.stopReason && asst.stopReason !== "stop" && asst.stopReason !== "toolUse" && (
				<div className={cn(
					"text-xs px-2 py-1 rounded border",
					asst.stopReason === "error" ? "bg-destructive/10 text-destructive border-destructive/20" :
					asst.stopReason === "aborted" ? "bg-muted text-muted-foreground border-border" :
					"bg-amber-500/10 text-amber-500 border-amber-500/20",
				)}>
					{asst.stopReason === "error" && (asst.errorMessage || "API error")}
					{asst.stopReason === "aborted" && "Cancelled"}
					{asst.stopReason === "length" && "Response truncated (token limit)"}
				</div>
			)}
		</div>
	);
}
