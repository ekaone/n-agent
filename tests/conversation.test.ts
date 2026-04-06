import { describe, it, expect, beforeEach, vi } from "vitest";
import { createChatBus } from "../src/bus.js";
import { createConversation } from "../src/conversation.js";
import type { AgentAdapter, ChatAgent } from "../src/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAdapter(responses: string[]): AgentAdapter {
  let call = 0;
  return {
    async *generate() {
      const text = responses[call++ % responses.length];
      for (const char of text) yield char; // simulate token-by-token streaming
    },
  };
}

function makeBus(agents: ChatAgent[]) {
  const bus = createChatBus();
  for (const a of agents) bus.register(a);
  return bus;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("createConversation()", () => {
  describe("validation", () => {
    it("throws with fewer than 2 participants", () => {
      const bus = makeBus([
        { name: "sonnet", type: "llm", adapter: makeAdapter(["hi"]) },
      ]);
      expect(() =>
        createConversation(bus, { participants: ["sonnet"], topic: "test" }),
      ).toThrow("at least 2 participants");
    });

    it("throws when a participant is not registered", () => {
      const bus = makeBus([
        { name: "sonnet", type: "llm", adapter: makeAdapter(["hi"]) },
      ]);
      expect(() =>
        createConversation(bus, {
          participants: ["sonnet", "ghost"],
          topic: "test",
        }),
      ).toThrow('"ghost" is not registered');
    });
  });

  describe("basic loop", () => {
    it("runs ping-pong turns and returns full history", async () => {
      const bus = makeBus([
        {
          name: "sonnet",
          type: "llm",
          adapter: makeAdapter(["Hello from Sonnet"]),
        },
        { name: "gpt", type: "llm", adapter: makeAdapter(["Hello from GPT"]) },
      ]);

      const convo = createConversation(bus, {
        participants: ["sonnet", "gpt"],
        topic: "Say hello",
        maxTurns: 2,
      });

      const history = await convo.start();

      // topic seed + 2 turns
      expect(history).toHaveLength(3);
      expect(history[1].speaker).toBe("sonnet");
      expect(history[1].content).toBe("Hello from Sonnet");
      expect(history[2].speaker).toBe("gpt");
      expect(history[2].content).toBe("Hello from GPT");
    });

    it("seeds the topic as the first history message", async () => {
      const bus = makeBus([
        { name: "a", type: "llm", adapter: makeAdapter(["A"]) },
        { name: "b", type: "llm", adapter: makeAdapter(["B"]) },
      ]);
      const convo = createConversation(bus, {
        participants: ["a", "b"],
        topic: "The topic",
        maxTurns: 2,
      });

      const history = await convo.start();
      expect(history[0].speaker).toBe("human");
      expect(history[0].content).toBe("The topic");
    });

    it("fires onToken for each chunk", async () => {
      const tokens: string[] = [];
      const bus = makeBus([
        { name: "a", type: "llm", adapter: makeAdapter(["ABC"]) },
        { name: "b", type: "llm", adapter: makeAdapter(["XYZ"]) },
      ]);
      const convo = createConversation(bus, {
        participants: ["a", "b"],
        topic: "go",
        maxTurns: 2,
        onToken: (chunk) => tokens.push(chunk),
      });

      await convo.start();
      expect(tokens.join("")).toBe("ABCXYZ");
    });

    it("fires onTurnComplete after each LLM turn", async () => {
      const completed: string[] = [];
      const bus = makeBus([
        { name: "a", type: "llm", adapter: makeAdapter(["done-a"]) },
        { name: "b", type: "llm", adapter: makeAdapter(["done-b"]) },
      ]);
      const convo = createConversation(bus, {
        participants: ["a", "b"],
        topic: "go",
        maxTurns: 2,
        onTurnComplete: (turn) => completed.push(turn.speaker),
      });

      await convo.start();
      expect(completed).toEqual(["a", "b"]);
    });
  });

  describe("stopSequence", () => {
    it("stops the loop when stopSequence is detected", async () => {
      const bus = makeBus([
        { name: "a", type: "llm", adapter: makeAdapter(["I am done [DONE]"]) },
        { name: "b", type: "llm", adapter: makeAdapter(["Still going"]) },
      ]);
      const convo = createConversation(bus, {
        participants: ["a", "b"],
        topic: "go",
        maxTurns: 6,
        stopSequence: "[DONE]",
      });

      const history = await convo.start();
      // topic + agent a's turn only (b never gets to speak)
      expect(history).toHaveLength(2);
    });

    it("strips the stopSequence from the saved content", async () => {
      const bus = makeBus([
        { name: "a", type: "llm", adapter: makeAdapter(["Finished [DONE]"]) },
        { name: "b", type: "llm", adapter: makeAdapter(["..."]) },
      ]);
      const convo = createConversation(bus, {
        participants: ["a", "b"],
        topic: "go",
        maxTurns: 4,
        stopSequence: "[DONE]",
      });

      const history = await convo.start();
      const aMsg = history.find((m) => m.speaker === "a");
      expect(aMsg?.content).toBe("Finished");
      expect(aMsg?.content).not.toContain("[DONE]");
    });
  });

  describe("stop()", () => {
    it("terminates the loop early", async () => {
      const bus = makeBus([
        { name: "a", type: "llm", adapter: makeAdapter(["msg"]) },
        { name: "b", type: "llm", adapter: makeAdapter(["msg"]) },
      ]);
      const convo = createConversation(bus, {
        participants: ["a", "b"],
        topic: "go",
        maxTurns: 10,
      });

      // Stop after first turn completes
      const p = convo.start();
      setTimeout(() => convo.stop(), 0);
      const history = await p;
      expect(history.length).toBeLessThan(12); // didn't run all 10 turns
    });

    it("state is stopped after stop()", async () => {
      const bus = makeBus([
        { name: "a", type: "llm", adapter: makeAdapter(["msg"]) },
        { name: "b", type: "llm", adapter: makeAdapter(["msg"]) },
      ]);
      const convo = createConversation(bus, {
        participants: ["a", "b"],
        topic: "go",
        maxTurns: 2,
      });

      await convo.start();
      expect(convo.state).toBe("stopped");
    });
  });

  describe("human participant", () => {
    it("pauses on human turn and resumes after send()", async () => {
      const bus = makeBus([
        { name: "sonnet", type: "llm", adapter: makeAdapter(["AI response"]) },
        { name: "human", type: "human" },
      ]);
      const convo = createConversation(bus, {
        participants: ["sonnet", "human"],
        topic: "discuss",
        maxTurns: 2,
      });

      const p = convo.start();

      // Wait for loop to reach human turn
      await vi.waitFor(() => expect(convo.state).toBe("awaiting-human"));
      convo.send("Human reply here");

      const history = await p;
      const humanMsg = history.find(
        (m) => m.speaker === "human" && m.turnIndex === 1,
      );
      expect(humanMsg?.content).toBe("Human reply here");
    });
  });

  describe("send() — interrupt", () => {
    it("saves partial: true on interrupted turn", async () => {
      // Adapter that yields slowly so we can interrupt mid-stream
      const slowAdapter: AgentAdapter = {
        async *generate(_, signal) {
          for (const char of "slow response here") {
            if (signal.aborted) break;
            yield char;
            await new Promise((r) => setTimeout(r, 5));
          }
        },
      };

      const bus = makeBus([
        { name: "a", type: "llm", adapter: slowAdapter },
        { name: "b", type: "llm", adapter: makeAdapter(["B reply"]) },
      ]);
      const convo = createConversation(bus, {
        participants: ["a", "b"],
        topic: "go",
        maxTurns: 4,
      });

      const p = convo.start();
      await vi.waitFor(() => expect(convo.state).toBe("streaming"));
      convo.send("Stop! Change direction.");

      const history = await p;
      const partial = history.find((m) => m.partial === true);
      expect(partial).toBeDefined();
      expect(partial?.speaker).toBe("a");
    });
  });

  describe("pauseCondition", () => {
    it("pauses after matching turn and resumes after send()", async () => {
      const bus = makeBus([
        { name: "a", type: "llm", adapter: makeAdapter(["msg a"]) },
        { name: "b", type: "llm", adapter: makeAdapter(["msg b"]) },
      ]);
      const convo = createConversation(bus, {
        participants: ["a", "b"],
        topic: "go",
        maxTurns: 2,
        pauseCondition: (ctx) => ctx.turnIndex === 0, // pause after first turn
      });

      const p = convo.start();
      await vi.waitFor(() => expect(convo.state).toBe("awaiting-human"));
      convo.send("Looks good, continue");

      const history = await p;
      const humanPause = history.find(
        (m) => m.speaker === "human" && m.content === "Looks good, continue",
      );
      expect(humanPause).toBeDefined();
    });
  });

  describe("state transitions", () => {
    it("reports correct state changes via onStateChange", async () => {
      const states: string[] = [];
      const bus = makeBus([
        { name: "a", type: "llm", adapter: makeAdapter(["hi"]) },
        { name: "b", type: "llm", adapter: makeAdapter(["hi"]) },
      ]);
      const convo = createConversation(bus, {
        participants: ["a", "b"],
        topic: "go",
        maxTurns: 2,
        onStateChange: (s) => states.push(s),
      });

      await convo.start();
      expect(states).toContain("streaming");
      expect(states.at(-1)).toBe("stopped");
    });
  });
});
