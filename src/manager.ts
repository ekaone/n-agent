// ─── AbortManager
// Tracks one AbortController per active turn.
// Only one turn can be streaming at a time, so we track by turnIndex.

export function createAbortManager() {
  let current: { turnIndex: number; controller: AbortController } | null = null;

  // Create a new controller for the given turn.
  // Automatically aborts any previously active controller (safety guard).
  function create(turnIndex: number): AbortController {
    if (current) {
      current.controller.abort();
    }
    const controller = new AbortController();
    current = { turnIndex, controller };
    return controller;
  }

  // Abort the current active turn's controller.
  // Returns true if there was an active stream to abort, false if idle.
  function abort(): boolean {
    if (!current) return false;
    current.controller.abort();
    current = null;
    return true;
  }

  // Clean up after a turn completes normally (no abort needed).
  function release(turnIndex: number): void {
    if (current?.turnIndex === turnIndex) {
      current = null;
    }
  }

  // Is a stream currently active?
  function isStreaming(): boolean {
    return current !== null;
  }

  function activeTurnIndex(): number | null {
    return current?.turnIndex ?? null;
  }

  return { create, abort, release, isStreaming, activeTurnIndex };
}

export type AbortManager = ReturnType<typeof createAbortManager>;
