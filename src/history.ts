import { randomUUID } from "node:crypto";
import type { ChatMessage, CoreMessage } from "./types.js";

// ─── MessageStore ─────────────────────────────────────────────────────────────

export function createMessageStore() {
  const messages: ChatMessage[] = [];

  function append(msg: Omit<ChatMessage, "id" | "timestamp">): ChatMessage {
    const full: ChatMessage = {
      ...msg,
      id: randomUUID(),
      timestamp: Date.now(),
    };
    messages.push(full);
    return full;
  }

  // Per-agent history projection:
  // - own messages          → role: 'assistant'
  // - everyone else         → role: 'user', content prefixed with "SpeakerName: ..."
  // - system prompt         → injected as role: 'system' at index 0 (if provided)
  function project(speakerName: string, system?: string): CoreMessage[] {
    const projected: CoreMessage[] = [];

    if (system) {
      projected.push({ role: "system", content: system });
    }

    for (const msg of messages) {
      if (msg.speaker === speakerName) {
        projected.push({
          role: "assistant",
          content: msg.content,
        });
      } else {
        projected.push({
          role: "user",
          // Name-prefix so the LLM knows who said what
          content: `${msg.speaker}: ${msg.content}`,
        });
      }
    }

    return projected;
  }

  function all(): ChatMessage[] {
    return [...messages]; // defensive copy
  }

  function last(): ChatMessage | undefined {
    return messages.at(-1);
  }

  function clear(): void {
    messages.length = 0;
  }

  return { append, project, all, last, clear };
}

export type MessageStore = ReturnType<typeof createMessageStore>;
