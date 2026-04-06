import { describe, it, expect, beforeEach, vi } from "vitest";
import { createChatBus } from "../src/bus.js";
import { createConversation } from "../src/conversation.js";
import { aiSdkAdapter } from "../src/adapters/ai-sdk.js";
import type { ChatAgent, AgentAdapter } from "../src/types.js";
import { createMockModel } from "./utils/mock-model.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBus(agents: ChatAgent[]) {
  const bus = createChatBus();
  for (const a of agents) bus.register(a);
  return bus;
}

// ─── Mock AI SDK Adapter Tests ────────────────────────────────────────────────

describe("AI SDK Mock Integration", () => {
  describe("basic conversation with mock model", () => {
    it("runs ping-pong turns using AI SDK mock model", async () => {
      const bus = makeBus([
        {
          name: "sonnet",
          type: "llm",
          adapter: aiSdkAdapter(
            createMockModel(["Hello from Sonnet", "Nice to meet you"]),
          ),
        },
        {
          name: "gpt",
          type: "llm",
          adapter: aiSdkAdapter(
            createMockModel(["Hello from GPT", "Goodbye!"]),
          ),
        },
      ]);

      const convo = createConversation(bus, {
        participants: ["sonnet", "gpt"],
        topic: "Start a conversation",
        maxTurns: 4,
      });

      const history = await convo.start();

      // topic seed + 4 turns
      expect(history).toHaveLength(5);
      expect(history[1].speaker).toBe("sonnet");
      expect(history[1].content).toBe("Hello from Sonnet");
      expect(history[2].speaker).toBe("gpt");
      expect(history[2].content).toBe("Hello from GPT");
    });

    it("streams tokens correctly with mock model", async () => {
      const tokens: string[] = [];
      // Direct mock adapter - yields characters one at a time
      const mockAdapter: AgentAdapter = {
        async *generate(_messages, signal) {
          for (const char of "ABC") {
            if (signal.aborted) break;
            yield char;
          }
        },
      };

      const bus = makeBus([
        {
          name: "ai",
          type: "llm",
          adapter: mockAdapter,
        },
      ]);

      const convo = createConversation(bus, {
        participants: ["ai", "ai"],
        topic: "test",
        maxTurns: 2,
        onToken: (chunk) => tokens.push(chunk),
      });

      await convo.start();
      expect(tokens.join("")).toBe("ABCABC");
    });

    it("handles stopSequence with mock model", async () => {
      const bus = makeBus([
        {
          name: "ai",
          type: "llm",
          adapter: aiSdkAdapter(createMockModel(["Response [DONE] here"])),
        },
      ]);

      const convo = createConversation(bus, {
        participants: ["ai", "ai"],
        topic: "test",
        maxTurns: 6,
        stopSequence: "[DONE]",
      });

      const history = await convo.start();
      // topic + first turn only (stopped by sequence)
      expect(history).toHaveLength(2);
      expect(history[1].content).not.toContain("[DONE]");
    });
  });

  describe("interrupt handling with mock model", () => {
    it("saves partial: true when interrupted", async () => {
      const bus = makeBus([
        {
          name: "slow",
          type: "llm",
          adapter: aiSdkAdapter(
            createMockModel(["This is a slow response that takes time"]),
          ),
        },
        {
          name: "fast",
          type: "llm",
          adapter: aiSdkAdapter(createMockModel(["Quick reply"])),
        },
      ]);

      const convo = createConversation(bus, {
        participants: ["slow", "fast"],
        topic: "go",
        maxTurns: 4,
      });

      const p = convo.start();
      // Wait briefly then interrupt
      await new Promise((r) => setTimeout(r, 10));
      convo.send("Stop! Change topic.");

      const history = await p;
      const partial = history.find((m) => m.partial === true);
      expect(partial).toBeDefined();
      expect(partial?.speaker).toBe("slow");
    });
  });

  describe("pause condition with mock model", () => {
    it("pauses after specified turn and resumes", async () => {
      const bus = makeBus([
        {
          name: "a",
          type: "llm",
          adapter: aiSdkAdapter(createMockModel(["Turn 1", "Turn 3"])),
        },
        {
          name: "b",
          type: "llm",
          adapter: aiSdkAdapter(createMockModel(["Turn 2", "Turn 4"])),
        },
      ]);

      const convo = createConversation(bus, {
        participants: ["a", "b"],
        topic: "start",
        maxTurns: 4,
        pauseCondition: (ctx) => ctx.turnIndex === 1, // pause after b's first turn
      });

      const p = convo.start();
      await vi.waitFor(() => expect(convo.state).toBe("awaiting-human"));
      convo.send("Continue please");

      const history = await p;
      const pauseMsg = history.find(
        (m) => m.speaker === "human" && m.content === "Continue please",
      );
      expect(pauseMsg).toBeDefined();
    });
  });

  describe("multiple mock models in rotation", () => {
    it("correctly cycles through multiple agents with different responses", async () => {
      const bus = makeBus([
        {
          name: "agent1",
          type: "llm",
          adapter: aiSdkAdapter(createMockModel(["A1-T1", "A1-T2"])),
        },
        {
          name: "agent2",
          type: "llm",
          adapter: aiSdkAdapter(createMockModel(["A2-T1", "A2-T2"])),
        },
        {
          name: "agent3",
          type: "llm",
          adapter: aiSdkAdapter(createMockModel(["A3-T1", "A3-T2"])),
        },
      ]);

      const convo = createConversation(bus, {
        participants: ["agent1", "agent2", "agent3"],
        topic: "multi-agent test",
        maxTurns: 6,
      });

      const history = await convo.start();

      // topic + 6 turns = 7 messages
      expect(history).toHaveLength(7);

      // Check rotation: agent1, agent2, agent3, agent1, agent2, agent3
      expect(history[1].speaker).toBe("agent1");
      expect(history[2].speaker).toBe("agent2");
      expect(history[3].speaker).toBe("agent3");
      expect(history[4].speaker).toBe("agent1");
      expect(history[5].speaker).toBe("agent2");
      expect(history[6].speaker).toBe("agent3");
    });
  });

  describe("state transitions with mock model", () => {
    it("reports correct states via onStateChange", async () => {
      const states: string[] = [];
      const bus = makeBus([
        {
          name: "ai",
          type: "llm",
          adapter: aiSdkAdapter(createMockModel(["hi"])),
        },
      ]);

      const convo = createConversation(bus, {
        participants: ["ai", "ai"],
        topic: "test",
        maxTurns: 2,
        onStateChange: (s) => states.push(s),
      });

      await convo.start();
      expect(states).toContain("streaming");
      expect(states.at(-1)).toBe("stopped");
    });
  });
});

// ─── Real API Tests (Optional, runs with REAL_API=1)

describe.skipIf(!process.env.REAL_API)("Real API Integration", () => {
  it("can run with actual Anthropic API", async () => {
    // This only runs if REAL_API=1 is set
    const { anthropicAdapter } = await import("../src/adapters/anthropic.js");

    const bus = makeBus([
      {
        name: "claude",
        type: "llm",
        adapter: anthropicAdapter({
          model: "claude-3-haiku-20240307",
          maxTokens: 100,
        }),
      },
    ]);

    const convo = createConversation(bus, {
      participants: ["claude", "claude"],
      topic: "Say hello in exactly 3 words",
      maxTurns: 2,
    });

    const history = await convo.start();
    expect(history.length).toBeGreaterThan(1);
    expect(history[1].content.length).toBeGreaterThan(0);
  });
});
