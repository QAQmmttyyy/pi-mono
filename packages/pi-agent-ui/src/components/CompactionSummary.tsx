import { useState, useMemo } from "react";
import { ChevronDown, FileArchive } from "lucide-react";
import { cn } from "../utils/cn.js";
import { Markdown } from "./ui/markdown.js";
import { CodeBlock, CodeBlockCode } from "./ui/code-block.js";
import { useTheme } from "./ThemeProvider.js";

interface Props {
	summary: string;
	tokensBefore: number;
}

export function CompactionSummary({ summary, tokensBefore }: Props) {
	const [expanded, setExpanded] = useState(false);
	const tokenStr = tokensBefore.toLocaleString();
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
		<div
			className={cn(
				"border rounded-md text-xs",
				"border-border bg-muted/50",
			)}
		>
			<button
				type="button"
				className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/80 transition-colors rounded-md cursor-pointer"
				onClick={() => setExpanded(!expanded)}
			>
				<FileArchive className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
				<span className="font-medium text-muted-foreground">[compaction]</span>
				<span className="text-muted-foreground">
					Compacted from {tokenStr} tokens
				</span>
				<ChevronDown
					className={cn(
						"h-3 w-3 ml-auto shrink-0 text-muted-foreground transition-transform",
						expanded && "rotate-180",
					)}
				/>
			</button>
			{expanded && (
				<div className="px-3 pb-2 pt-1 max-h-[40vh] overflow-y-auto prose prose-sm dark:prose-invert max-w-none text-muted-foreground text-xs">
					<Markdown key={`cs-${theme}`} components={components}>{summary}</Markdown>
				</div>
			)}
		</div>
	);
}