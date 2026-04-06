import type { AgentAdapter, CoreMessage } from "../types.js";

// Lazy import — only fails at runtime if user hasn't installed 'ai'.
// This keeps the core package free of hard AI SDK dependency.
type StreamTextFn = typeof import("ai").streamText;
type LanguageModel = import("ai").LanguageModel;

export function aiSdkAdapter(model: LanguageModel): AgentAdapter {
  return {
    async *generate(
      messages: CoreMessage[],
      signal: AbortSignal,
    ): AsyncIterable<string> {
      // Lazy import — throws a clear error if 'ai' is not installed.
      let streamText: StreamTextFn;
      try {
        const mod = await import("ai");
        streamText = mod.streamText;
      } catch {
        throw new Error(
          '[agent-chat] aiSdkAdapter requires the "ai" package. ' +
            "Run: pnpm add ai",
        );
      }

      const result = streamText({
        model,
        messages,
        abortSignal: signal,
      });

      for await (const chunk of result.textStream) {
        if (signal.aborted) break;
        yield chunk;
      }
    },
  };
}
