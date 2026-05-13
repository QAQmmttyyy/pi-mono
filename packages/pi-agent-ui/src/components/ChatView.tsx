import { useState } from "react";
import { useSession } from "../SessionContext.js";
import {
	ChatContainerRoot,
	ChatContainerContent,
	ChatContainerScrollAnchor,
} from "./ui/chat-container.js";
import { MessageBubble } from "./MessageBubble.js";
import {
	PromptInput,
	PromptInputTextarea,
	PromptInputActions,
	PromptInputAction,
} from "./ui/prompt-input.js";
import { ModelSelector } from "./ModelSelector.js";
import { ThinkingSelector } from "./ThinkingSelector.js";
import { Zap, ZapOff } from "lucide-react";

export function ChatView() {
	const { messages, isStreaming, sendPrompt, abortPrompt, error } = useSession();
	const [inputValue, setInputValue] = useState("");

	const handleSend = () => {
		if (!inputValue.trim()) return;
		sendPrompt(inputValue);
		setInputValue("");
	};

	return (
		<>
			<ChatContainerRoot className="flex-1 min-h-0">
				<ChatContainerContent className="p-4">
					{messages.length === 0 ? (
						<div className="flex items-center justify-center h-full text-muted-foreground text-sm">
							Send a message to start
						</div>
					) : (
						<div className="space-y-6">
							{messages.map((msg) => (
								<MessageBubble key={msg.id} msg={msg} />
							))}
						</div>
					)}
					<ChatContainerScrollAnchor />
				</ChatContainerContent>
			</ChatContainerRoot>

			<div className="p-3 shrink-0">
				<PromptInput
					className="min-w-fit rounded-xl"
					isLoading={isStreaming}
					value={inputValue}
					onValueChange={setInputValue}
					onSubmit={handleSend}
				>
					<PromptInputTextarea placeholder="Send a message..." />
					<PromptInputActions>
						<ModelSelector />
						<ThinkingSelector />
						<div className="flex-1 min-w-2" />
						{isStreaming ? (
							<PromptInputAction tooltip="Stop generation">
								<button type="button" onClick={abortPrompt} className="p-1">
									<ZapOff className="h-4 w-4 text-destructive" />
								</button>
							</PromptInputAction>
						) : (
							<PromptInputAction tooltip="Send">
								<button
									type="button"
									onClick={handleSend}
									disabled={!inputValue.trim()}
									className="p-1 disabled:opacity-50"
								>
									<Zap className="h-4 w-4" />
								</button>
							</PromptInputAction>
						)}
					</PromptInputActions>
				</PromptInput>
			</div>

			{error && (
				<div className="border-t border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
					{error}
				</div>
			)}
		</>
	);
}
