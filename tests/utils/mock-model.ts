import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import type { LanguageModel } from "ai";

/**
 * Creates a mock AI SDK language model that yields predefined text responses.
 * Each call to generate() cycles through the provided responses.
 */
export function createMockModel(responses: string[]): LanguageModel {
  let callIndex = 0;

  return new MockLanguageModelV3({
    doStream: async () => {
      const response = responses[callIndex++ % responses.length];
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "text-1" },
            ...response.split("").map((char) => ({
              type: "text-delta" as const,
              id: "text-1",
              delta: char,
            })),
            { type: "text-end", id: "text-1" },
            {
              type: "finish",
              finishReason: { unified: "stop" as const, raw: undefined },
              logprobs: undefined,
              usage: {
                inputTokens: {
                  total: 10,
                  noCache: 10,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: {
                  total: response.length,
                  text: response.length,
                  reasoning: undefined,
                },
              },
            },
          ],
        }),
      };
    },
  });
}

// Re-export for compatibility
export { MockLanguageModelV3, simulateReadableStream };
