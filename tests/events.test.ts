import { describe, it, expect } from "vitest";
import { createChatBus } from "../src/bus.js";
import { createConversation } from "../src/conversation.js";
import type { AgentAdapter, ChatAgent } from "../src/types.js";

function makeBus(agents: ChatAgent[]) {
  const bus = createChatBus();
  for (const a of agents) bus.register(a);
  return bus;
}

describe("Conversation events", () => {
  it("emits token events and keeps onToken working", async () => {
    const tokensFromEvent: string[] = [];
    const tokensFromCallback: string[] = [];

    const mockAdapter: AgentAdapter = {
      async *generate(_messages, signal) {
        for (const char of "ABC") {
          if (signal.aborted) break;
          yield char;
        }
      },
    };

    const bus = makeBus([
      { name: "ai", type: "llm", adapter: mockAdapter },
    ]);

    const convo = createConversation(bus, {
      participants: ["ai", "ai"],
      topic: "test",
      maxTurns: 2,
      onToken: (chunk) => tokensFromCallback.push(chunk),
    });

    convo.on("token", ({ chunk }) => tokensFromEvent.push(chunk));

    await convo.start();

    expect(tokensFromEvent.join("")).toBe("ABCABC");
    expect(tokensFromCallback.join("")).toBe("ABCABC");
  });

  it("supports multiple listeners, off(), and once()", async () => {
    const adapter: AgentAdapter = {
      async *generate() {
        yield "X";
      },
    };

    const bus = makeBus([{ name: "ai", type: "llm", adapter }]);
    const convo = createConversation(bus, {
      participants: ["ai", "ai"],
      topic: "t",
      maxTurns: 2,
    });

    const order: string[] = [];

    const h1 = () => order.push("h1");
    const h2 = () => order.push("h2");
    const h3 = () => order.push("h3");

    convo.on("turnComplete", h1);
    const unsub2 = convo.on("turnComplete", h2);
    convo.once("turnComplete", h3);

    // Remove h2 before running.
    unsub2();

    await convo.start();

    // Two turns, h1 should fire twice, h3 once.
    expect(order).toEqual(["h1", "h3", "h1"]);
  });

  it("emits state events and keeps onStateChange working", async () => {
    const statesFromEvent: string[] = [];
    const statesFromCallback: string[] = [];

    const adapter: AgentAdapter = {
      async *generate() {
        yield "ok";
      },
    };

    const bus = makeBus([{ name: "ai", type: "llm", adapter }]);
    const convo = createConversation(bus, {
      participants: ["ai", "ai"],
      topic: "t",
      maxTurns: 2,
      onStateChange: (s) => statesFromCallback.push(s),
    });

    convo.on("state", ({ state }) => statesFromEvent.push(state));

    await convo.start();

    expect(statesFromEvent).toContain("streaming");
    expect(statesFromEvent.at(-1)).toBe("stopped");
    expect(statesFromCallback).toContain("streaming");
    expect(statesFromCallback.at(-1)).toBe("stopped");
  });
});

