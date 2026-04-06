import type { AgentAdapter, CoreMessage } from "../types.js";

// Lazy import — only fails at runtime if user hasn't installed @anthropic-ai/sdk.
type AnthropicConstructor = typeof import("@anthropic-ai/sdk").default;

export type AnthropicAdapterOptions = {
  model: string;
  maxTokens?: number;
  apiKey?: string; // falls back to ANTHROPIC_API_KEY env var
};

export function anthropicAdapter(
  options: AnthropicAdapterOptions,
): AgentAdapter {
  const { model, maxTokens = 1024, apiKey } = options;

  return {
    async *generate(
      messages: CoreMessage[],
      signal: AbortSignal,
    ): AsyncIterable<string> {
      let Anthropic: AnthropicConstructor;
      try {
        const mod = await import("@anthropic-ai/sdk");
        Anthropic = mod.default;
      } catch {
        throw new Error(
          '[agent-chat] anthropicAdapter requires the "@anthropic-ai/sdk" package. ' +
            "Run: pnpm add @anthropic-ai/sdk",
        );
      }

      const client = new Anthropic({ apiKey });

      // Split system message out — Anthropic API takes it separately.
      const systemMsg = messages.find((m) => m.role === "system");
      const chatMessages = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      const stream = client.messages.stream(
        {
          model,
          max_tokens: maxTokens,
          ...(systemMsg ? { system: systemMsg.content } : {}),
          messages: chatMessages,
        },
        { signal },
      );

      for await (const event of stream) {
        if (signal.aborted) break;
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield event.delta.text;
        }
      }
    },
  };
}
