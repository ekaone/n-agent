import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createChatBus } from "../src/bus.js";
import { createConversation } from "../src/conversation.js";
import type { AgentAdapter, ChatAgent } from "../src/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAdapter(responses: string[]): AgentAdapter {
  let call = 0;
  return {
    async *generate() {
      const text = responses[call++ % responses.length]!;
      for (const ch of text) yield ch;
    },
  };
}

function makeFailingAdapter(failTimes: number, thenRespond: string): AgentAdapter {
  let calls = 0;
  return {
    async *generate(_, signal) {
      if (signal.aborted) return;
      if (calls++ < failTimes) throw new Error("transient");
      for (const ch of thenRespond) yield ch;
    },
  };
}

function makeAlwaysFailingAdapter(message = "persistent error"): AgentAdapter {
  return {
    async *generate() {
      throw new Error(message);
    },
  };
}

function makeBus(agents: ChatAgent[]) {
  const bus = createChatBus();
  for (const a of agents) bus.register(a);
  return bus;
}

function twoAgentBus(
  adapter1: AgentAdapter,
  adapter2: AgentAdapter = makeAdapter(["pong"]),
) {
  return makeBus([
    { name: "a", type: "llm", adapter: adapter1 },
    { name: "b", type: "llm", adapter: adapter2 },
  ]);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("retry & error recovery", () => {
  describe("default behaviour (no retry option)", () => {
    it("stops immediately on first error, reason is 'error'", async () => {
      const bus = twoAgentBus(makeAlwaysFailingAdapter());
      const convo = createConversation(bus, {
        participants: ["a", "b"],
        topic: "start",
        maxTurns: 4,
      });

      const errorEvents: unknown[] = [];
      const stoppedEvents: Array<{ reason: string }> = [];
      const retryEvents: unknown[] = [];

      convo.on("error", (p) => errorEvents.push(p));
      convo.on("stopped", (p) => stoppedEvents.push(p));
      convo.on("retry", (p) => retryEvents.push(p));

      await convo.start();

      expect(errorEvents).toHaveLength(1);
      expect(retryEvents).toHaveLength(0);
      expect(stoppedEvents[0]?.reason).toBe("error");
    });
  });

  describe("maxAttempts: 3 — success after failures", () => {
    it("completes normally when adapter succeeds on 3rd attempt", async () => {
      // fails twice, then succeeds
      const bus = twoAgentBus(makeFailingAdapter(2, "recovered"));
      const convo = createConversation(bus, {
        participants: ["a", "b"],
        topic: "start",
        maxTurns: 2,
        retry: { maxAttempts: 3, backoff: "none" },
      });

      const errorEvents: unknown[] = [];
      const retryEvents: unknown[] = [];
      convo.on("error", (p) => errorEvents.push(p));
      convo.on("retry", (p) => retryEvents.push(p));

      const history = await convo.start();

      expect(errorEvents).toHaveLength(0);
      expect(retryEvents).toHaveLength(2); // attempt 1 and 2 triggered retries
      const aMsg = history.find((m) => m.speaker === "a");
      expect(aMsg?.content).toBe("recovered");
    });
  });

  describe("exhaust all attempts", () => {
    it("emits error and stops with reason 'error' after maxAttempts", async () => {
      const bus = twoAgentBus(makeAlwaysFailingAdapter("boom"));
      const convo = createConversation(bus, {
        participants: ["a", "b"],
        topic: "start",
        maxTurns: 4,
        retry: { maxAttempts: 3, backoff: "none" },
      });

      const errorEvents: Array<{ error: unknown }> = [];
      const retryEvents: unknown[] = [];
      const stoppedEvents: Array<{ reason: string }> = [];

      convo.on("error", (p) => errorEvents.push(p));
      convo.on("retry", (p) => retryEvents.push(p));
      convo.on("stopped", (p) => stoppedEvents.push(p));

      await convo.start();

      expect(retryEvents).toHaveLength(2); // fired after attempt 1 and 2
      expect(errorEvents).toHaveLength(1);
      expect((errorEvents[0]!.error as Error).message).toBe("boom");
      expect(stoppedEvents[0]?.reason).toBe("error");
    });
  });

  describe("shouldRetry returning false", () => {
    it("stops after first error when shouldRetry returns false", async () => {
      const bus = twoAgentBus(makeAlwaysFailingAdapter());
      const shouldRetry = vi.fn().mockReturnValue(false);

      const convo = createConversation(bus, {
        participants: ["a", "b"],
        topic: "start",
        maxTurns: 2,
        retry: { maxAttempts: 3, backoff: "none", shouldRetry },
      });

      const retryEvents: unknown[] = [];
      convo.on("retry", (p) => retryEvents.push(p));

      await convo.start();

      expect(shouldRetry).toHaveBeenCalledOnce();
      expect(retryEvents).toHaveLength(0);
    });
  });

  describe("onRetry callback", () => {
    it("fires with correct RetryContext on each retry", async () => {
      const bus = twoAgentBus(makeFailingAdapter(2, "ok"));
      const onRetry = vi.fn();

      await createConversation(bus, {
        participants: ["a", "b"],
        topic: "start",
        maxTurns: 2,
        retry: { maxAttempts: 3, backoff: "none" },
        onRetry,
      }).start();

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry.mock.calls[0]![0]).toMatchObject({
        speaker: "a",
        turnIndex: 0,
        attempt: 1,
        maxAttempts: 3,
        delayMs: 0,
      });
      expect(onRetry.mock.calls[0]![0].error).toBeInstanceOf(Error);
      expect(onRetry.mock.calls[1]![0].attempt).toBe(2);
    });
  });

  describe("retry event", () => {
    it("emits retry event with correct context", async () => {
      const bus = twoAgentBus(makeFailingAdapter(1, "ok"));
      const convo = createConversation(bus, {
        participants: ["a", "b"],
        topic: "start",
        maxTurns: 2,
        retry: { maxAttempts: 2, backoff: "none" },
      });

      const retryEvents: Array<{ attempt: number; speaker: string }> = [];
      convo.on("retry", (p) => retryEvents.push(p));

      await convo.start();

      expect(retryEvents).toHaveLength(1);
      expect(retryEvents[0]).toMatchObject({ attempt: 1, speaker: "a" });
    });
  });

  describe("back-off timing", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("exponential: delays are 1000, 2000", async () => {
      const bus = twoAgentBus(makeFailingAdapter(2, "ok"));
      const delays: number[] = [];

      const convo = createConversation(bus, {
        participants: ["a", "b"],
        topic: "start",
        maxTurns: 2,
        retry: {
          maxAttempts: 3,
          backoff: "exponential",
          initialDelayMs: 1000,
        },
        onRetry: (ctx) => delays.push(ctx.delayMs),
      });

      const promise = convo.start();
      // advance past both back-off delays
      await vi.runAllTimersAsync();
      await promise;

      expect(delays).toEqual([1000, 2000]);
    });

    it("linear: delays are 1000, 2000, 3000", async () => {
      const bus = twoAgentBus(makeAlwaysFailingAdapter());
      const delays: number[] = [];

      const convo = createConversation(bus, {
        participants: ["a", "b"],
        topic: "start",
        maxTurns: 2,
        retry: {
          maxAttempts: 4,
          backoff: "linear",
          initialDelayMs: 1000,
        },
        onRetry: (ctx) => delays.push(ctx.delayMs),
      });

      const promise = convo.start();
      await vi.runAllTimersAsync();
      await promise;

      expect(delays).toEqual([1000, 2000, 3000]);
    });

    it("none: delay is always 0", async () => {
      const bus = twoAgentBus(makeAlwaysFailingAdapter());
      const delays: number[] = [];

      const convo = createConversation(bus, {
        participants: ["a", "b"],
        topic: "start",
        maxTurns: 2,
        retry: { maxAttempts: 3, backoff: "none" },
        onRetry: (ctx) => delays.push(ctx.delayMs),
      });

      await convo.start();
      expect(delays).toEqual([0, 0]);
    });

    it("maxDelayMs caps the delay", async () => {
      const bus = twoAgentBus(makeAlwaysFailingAdapter());
      const delays: number[] = [];

      const convo = createConversation(bus, {
        participants: ["a", "b"],
        topic: "start",
        maxTurns: 2,
        retry: {
          maxAttempts: 3,
          backoff: "exponential",
          initialDelayMs: 1000,
          maxDelayMs: 1500,
        },
        onRetry: (ctx) => delays.push(ctx.delayMs),
      });

      const promise = convo.start();
      await vi.runAllTimersAsync();
      await promise;

      expect(delays).toEqual([1000, 1500]); // 2000 capped to 1500
    });
  });

  describe("stop() during back-off sleep", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("exits retry loop immediately when stop() is called during sleep", async () => {
      const bus = twoAgentBus(makeAlwaysFailingAdapter());
      const convo = createConversation(bus, {
        participants: ["a", "b"],
        topic: "start",
        maxTurns: 4,
        retry: { maxAttempts: 5, backoff: "exponential", initialDelayMs: 5000 },
      });

      const retryEvents: unknown[] = [];
      convo.on("retry", (p) => retryEvents.push(p));

      let startResolved = false;
      const promise = convo.start().then((h) => {
        startResolved = true;
        return h;
      });

      // Let first attempt run and fire retry (now sleeping 5s)
      await vi.advanceTimersByTimeAsync(0);
      convo.stop();
      await vi.runAllTimersAsync();
      await promise;

      expect(startResolved).toBe(true);
      expect(retryEvents).toHaveLength(1); // only 1 retry fired before stop
    });
  });

  describe("stop-sequence during attempt", () => {
    it("exits retry loop and uses 'stopSequence' reason, not 'error'", async () => {
      const bus = twoAgentBus(makeAdapter(["hello [DONE] world"]));
      const convo = createConversation(bus, {
        participants: ["a", "b"],
        topic: "start",
        maxTurns: 4,
        stopSequence: "[DONE]",
        retry: { maxAttempts: 3, backoff: "none" },
      });

      const stoppedEvents: Array<{ reason: string }> = [];
      convo.on("stopped", (p) => stoppedEvents.push(p));

      await convo.start();

      expect(stoppedEvents[0]?.reason).toBe("stopSequence");
    });
  });
});
