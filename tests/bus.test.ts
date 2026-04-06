import { describe, it, expect, beforeEach } from "vitest";
import { createChatBus } from "../src/bus.js";
import type { ChatAgent, AgentAdapter } from "../src/types.js";

// Minimal stub adapter for tests
const stubAdapter: AgentAdapter = {
  async *generate() {
    yield "ok";
  },
};

const llmAgent = (name: string): ChatAgent => ({
  name,
  type: "llm",
  adapter: stubAdapter,
});

const humanAgent = (name: string): ChatAgent => ({
  name,
  type: "human",
});

describe("ChatBus", () => {
  let bus: ReturnType<typeof createChatBus>;

  beforeEach(() => {
    bus = createChatBus();
  });

  describe("register()", () => {
    it("registers an llm agent", () => {
      bus.register(llmAgent("sonnet"));
      expect(bus.has("sonnet")).toBe(true);
    });

    it("registers a human agent", () => {
      bus.register(humanAgent("human"));
      expect(bus.has("human")).toBe(true);
    });

    it("throws on duplicate name", () => {
      bus.register(llmAgent("sonnet"));
      expect(() => bus.register(llmAgent("sonnet"))).toThrow(
        'Agent "sonnet" is already registered',
      );
    });

    it("throws when llm agent has no adapter", () => {
      expect(() => bus.register({ name: "bad", type: "llm" })).toThrow(
        "no adapter provided",
      );
    });
  });

  describe("get()", () => {
    it("returns a registered agent", () => {
      bus.register(llmAgent("sonnet"));
      const agent = bus.get("sonnet");
      expect(agent.name).toBe("sonnet");
    });

    it("throws for unknown agent", () => {
      expect(() => bus.get("ghost")).toThrow('Agent "ghost" not found');
    });

    it("error message includes registered agent names", () => {
      bus.register(llmAgent("sonnet"));
      expect(() => bus.get("ghost")).toThrow("sonnet");
    });
  });

  describe("has()", () => {
    it("returns false for unregistered agent", () => {
      expect(bus.has("x")).toBe(false);
    });

    it("returns true after registration", () => {
      bus.register(llmAgent("sonnet"));
      expect(bus.has("sonnet")).toBe(true);
    });
  });

  describe("list()", () => {
    it("returns empty array initially", () => {
      expect(bus.list()).toEqual([]);
    });

    it("returns all registered agent names", () => {
      bus.register(llmAgent("sonnet"));
      bus.register(llmAgent("gpt"));
      bus.register(humanAgent("human"));
      expect(bus.list()).toEqual(["sonnet", "gpt", "human"]);
    });
  });

  describe("unregister()", () => {
    it("removes a registered agent", () => {
      bus.register(llmAgent("sonnet"));
      bus.unregister("sonnet");
      expect(bus.has("sonnet")).toBe(false);
    });

    it("returns true on successful removal", () => {
      bus.register(llmAgent("sonnet"));
      expect(bus.unregister("sonnet")).toBe(true);
    });

    it("returns false for unknown agent", () => {
      expect(bus.unregister("ghost")).toBe(false);
    });
  });
});
