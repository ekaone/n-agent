import { describe, it, expect, beforeEach } from "vitest";
import { createAbortManager } from "../src/manager.js";

describe("AbortManager", () => {
  let manager: ReturnType<typeof createAbortManager>;

  beforeEach(() => {
    manager = createAbortManager();
  });

  describe("create()", () => {
    it("returns an AbortController", () => {
      const ctrl = manager.create(0);
      expect(ctrl).toBeInstanceOf(AbortController);
    });

    it("marks manager as streaming", () => {
      manager.create(0);
      expect(manager.isStreaming()).toBe(true);
    });

    it("tracks the active turn index", () => {
      manager.create(3);
      expect(manager.activeTurnIndex()).toBe(3);
    });

    it("aborts previous controller when a new turn is created", () => {
      const first = manager.create(0);
      manager.create(1);
      expect(first.signal.aborted).toBe(true);
    });

    it("new controller is not yet aborted", () => {
      const ctrl = manager.create(0);
      expect(ctrl.signal.aborted).toBe(false);
    });
  });

  describe("abort()", () => {
    it("returns false when nothing is streaming", () => {
      expect(manager.abort()).toBe(false);
    });

    it("returns true when a stream is active", () => {
      manager.create(0);
      expect(manager.abort()).toBe(true);
    });

    it("aborts the active controller", () => {
      const ctrl = manager.create(0);
      manager.abort();
      expect(ctrl.signal.aborted).toBe(true);
    });

    it("clears streaming state after abort", () => {
      manager.create(0);
      manager.abort();
      expect(manager.isStreaming()).toBe(false);
    });

    it("activeTurnIndex is null after abort", () => {
      manager.create(0);
      manager.abort();
      expect(manager.activeTurnIndex()).toBeNull();
    });
  });

  describe("release()", () => {
    it("clears state when turn index matches", () => {
      manager.create(2);
      manager.release(2);
      expect(manager.isStreaming()).toBe(false);
    });

    it("does not clear state when turn index does not match", () => {
      manager.create(2);
      manager.release(5); // wrong index — should be a no-op
      expect(manager.isStreaming()).toBe(true);
    });
  });

  describe("isStreaming()", () => {
    it("is false initially", () => {
      expect(manager.isStreaming()).toBe(false);
    });

    it("is true after create()", () => {
      manager.create(0);
      expect(manager.isStreaming()).toBe(true);
    });

    it("is false after release()", () => {
      manager.create(0);
      manager.release(0);
      expect(manager.isStreaming()).toBe(false);
    });
  });
});
