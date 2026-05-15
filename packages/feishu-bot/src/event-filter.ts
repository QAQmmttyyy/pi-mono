/**
 * Event filter — transforms raw agent WebSocket events into
 * IM-friendly reply messages.
 *
 * The agent emits granular events:
 *   text_delta, thinking_delta, tool_execution_start, message_end, ...
 *
 * The IM bot only cares about:
 *   - Final text content (accumulated from text_deltas + message_end)
 *   - Error messages
 *   - Status updates (optional: "Working on it...")
 *
 * This filter subscribes to a WebSocket and buffers events,
 * emitting only IM-friendly packets.
 */

export type FilterCallback = {
	/** Called when final text is ready */
	onReply: (text: string) => void;
	/** Called when an error occurs */
	onError: (error: string) => void;
	/** Called when the agent starts processing */
	onAgentStart?: () => void;
};

/**
 * Create an event filter that processes raw agent events.
 *
 * Call `processEvent` for each incoming WebSocket message.
 * Call `flush` to get any buffered text.
 */
export function createEventFilter(callbacks: FilterCallback) {
	let buffer = "";
	let streaming = false;

	return {
		processEvent(msg: Record<string, unknown>): void {
			switch (msg.type) {
				case "agent_start":
					buffer = "";
					streaming = true;
					callbacks.onAgentStart?.();
					break;

				case "message_update": {
					if (!streaming) break;
					const ev = (msg as { assistantMessageEvent?: { type?: string; delta?: string } }).assistantMessageEvent;
					if (ev?.type === "text_delta" && ev.delta) {
						buffer += ev.delta;
					}
					break;
				}

				case "message_end": {
					if (buffer) {
						callbacks.onReply(buffer);
						buffer = "";
					}
					break;
				}

				case "agent_end": {
					streaming = false;
					if (buffer) {
						callbacks.onReply(buffer);
						buffer = "";
					}
					break;
				}

				case "response": {
					const response = msg as { command: string; success: boolean; error?: string };
					if (response.command === "prompt" && !response.success) {
						callbacks.onError(response.error ?? "Unknown error");
					}
					break;
				}

				default:
					// Ignore other event types
					break;
			}
		},

		/** Flush any remaining buffered text */
		flush(): void {
			if (buffer) {
				callbacks.onReply(buffer);
				buffer = "";
			}
		},

		/** Reset the buffer */
		reset(): void {
			buffer = "";
			streaming = false;
		},
	};
}
