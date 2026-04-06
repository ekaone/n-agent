import { describe, it, expect, beforeEach } from "vitest";
import { createMessageStore } from "../src/history.js";

describe("MessageStore", () => {
  let store: ReturnType<typeof createMessageStore>;

  beforeEach(() => {
    store = createMessageStore();
  });

  // ─── append

  describe("append()", () => {
    it("assigns id and timestamp automatically", () => {
      const msg = store.append({
        speaker: "sonnet",
        role: "assistant",
        content: "Hello",
        turnIndex: 0,
      });

      expect(msg.id).toBeDefined();
      expect(msg.timestamp).toBeGreaterThan(0);
    });

    it("stores messages in insertion order", () => {
      store.append({
        speaker: "sonnet",
        role: "assistant",
        content: "A",
        turnIndex: 0,
      });
      store.append({
        speaker: "gpt",
        role: "user",
        content: "B",
        turnIndex: 1,
      });

      const all = store.all();
      expect(all[0].content).toBe("A");
      expect(all[1].content).toBe("B");
    });

    it("preserves partial flag when set", () => {
      const msg = store.append({
        speaker: "sonnet",
        role: "assistant",
        content: "Partial...",
        turnIndex: 0,
        partial: true,
      });
      expect(msg.partial).toBe(true);
    });
  });

  // ─── project

  describe("project()", () => {
    beforeEach(() => {
      // Seed a 3-turn conversation: sonnet → gpt → human
      store.append({
        speaker: "sonnet",
        role: "assistant",
        content: "I think AI will change everything.",
        turnIndex: 0,
      });
      store.append({
        speaker: "gpt",
        role: "assistant",
        content: "I disagree, hype is overstated.",
        turnIndex: 1,
      });
      store.append({
        speaker: "human",
        role: "user",
        content: "Stay on topic please.",
        turnIndex: 2,
      });
    });

    it("maps own messages to role: 'assistant'", () => {
      const projected = store.project("sonnet");
      const own = projected.find(
        (m) => m.content === "I think AI will change everything.",
      );
      expect(own?.role).toBe("assistant");
    });

    it("maps other agent messages to role: 'user'", () => {
      const projected = store.project("sonnet");
      const other = projected.find((m) => m.content.startsWith("gpt:"));
      expect(other?.role).toBe("user");
    });

    it("prefixes other speakers with their name", () => {
      const projected = store.project("sonnet");
      expect(
        projected.some(
          (m) => m.content === "gpt: I disagree, hype is overstated.",
        ),
      ).toBe(true);
      expect(
        projected.some((m) => m.content === "human: Stay on topic please."),
      ).toBe(true);
    });

    it("does not prefix own messages", () => {
      const projected = store.project("sonnet");
      const own = projected.find((m) => m.role === "assistant");
      expect(own?.content).not.toContain("sonnet:");
    });

    it("injects system prompt as first message when provided", () => {
      const projected = store.project("sonnet", "You are a creative thinker.");
      expect(projected[0]).toEqual({
        role: "system",
        content: "You are a creative thinker.",
      });
    });

    it("returns no system message when system is omitted", () => {
      const projected = store.project("gpt");
      expect(projected[0].role).not.toBe("system");
    });

    it("gives correct view to gpt — sonnet and human are users", () => {
      const projected = store.project("gpt");
      const roles = projected.map((m) => m.role);
      // sonnet(user), gpt(assistant), human(user)
      expect(roles).toEqual(["user", "assistant", "user"]);
    });

    it("gives correct view to human (edge case — all others are users)", () => {
      const projected = store.project("human");
      const roles = projected.map((m) => m.role);
      // sonnet(user), gpt(user), human(assistant)
      expect(roles).toEqual(["user", "user", "assistant"]);
    });
  });

  // ─── all / last / clear

  describe("all()", () => {
    it("returns a defensive copy", () => {
      store.append({
        speaker: "sonnet",
        role: "assistant",
        content: "Hi",
        turnIndex: 0,
      });
      const snapshot = store.all();
      snapshot.pop();
      expect(store.all()).toHaveLength(1);
    });
  });

  describe("last()", () => {
    it("returns undefined on empty store", () => {
      expect(store.last()).toBeUndefined();
    });

    it("returns the most recent message", () => {
      store.append({
        speaker: "sonnet",
        role: "assistant",
        content: "First",
        turnIndex: 0,
      });
      store.append({
        speaker: "gpt",
        role: "user",
        content: "Last",
        turnIndex: 1,
      });
      expect(store.last()?.content).toBe("Last");
    });
  });

  describe("clear()", () => {
    it("empties the store", () => {
      store.append({
        speaker: "sonnet",
        role: "assistant",
        content: "Hi",
        turnIndex: 0,
      });
      store.clear();
      expect(store.all()).toHaveLength(0);
    });
  });
});
