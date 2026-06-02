import type {
  ChatMessage,
  ConversationOptions,
  ConversationHandle,
  LoopState,
  SendResult,
  TurnContext,
  ConversationEventMap,
  ConversationStoppedReason,
  HumanAwaitingReason,
  RetryContext,
} from "./types.js";
import type { ChatBus } from "./bus.js";
import { createMessageStore } from "./history.js";
import { createAbortManager } from "./manager.js";
import { createTypedEmitter } from "./emitter.js";

export function createConversation(
  bus: ChatBus,
  options: ConversationOptions,
): ConversationHandle {
  const {
    participants,
    topic,
    maxTurns = 10,
    stopSequence,
    pauseCondition,
    delayMs = 0,
    onToken,
    onTurnComplete,
    onStateChange,
  } = options;

  // ─── Validate participants ────────────────────────────────────────────────

  if (participants.length < 2) {
    throw new Error(
      "[agent-chat] A conversation requires at least 2 participants.",
    );
  }

  for (const name of participants) {
    if (!bus.has(name)) {
      throw new Error(
        `[agent-chat] Participant "${name}" is not registered on the bus.`,
      );
    }
  }

  // ─── Internal state ───────────────────────────────────────────────────────

  const store = createMessageStore();
  const manager = createAbortManager();
  const events = createTypedEmitter<ConversationEventMap>();

  let _state: LoopState = "idle";
  let _stopped = false;
  let _stopReason: ConversationStoppedReason | null = null;
  let _stopTurnIndex: number | null = null;

  let _humanInputResolve: ((msg: string) => void) | null = null;
  let _humanInputPromise: Promise<string> | null = null;

  let _pendingInterrupt: string | null = null;
  let _pendingIdleMessage: string | null = null;

  // ─── Retry config ─────────────────────────────────────────────────────────

  const retryMaxAttempts = options.retry?.maxAttempts ?? 1;
  const retryBackoff     = options.retry?.backoff         ?? "exponential";
  const retryInitialMs   = options.retry?.initialDelayMs  ?? 1000;
  const retryMaxMs       = options.retry?.maxDelayMs      ?? 30_000;
  const retryShouldRetry = options.retry?.shouldRetry     ?? (() => true);

  function retryDelay(attempt: number): number {
    const d = retryBackoff === "none"   ? 0
            : retryBackoff === "linear" ? retryInitialMs * attempt
            : /* exponential */           retryInitialMs * 2 ** (attempt - 1);
    return Math.min(d, retryMaxMs);
  }

  // ─── Sleep helper (abortable) ─────────────────────────────────────────────

  function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal?.aborted) return resolve();
      const t = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
    });
  }

  // ─── State helpers ────────────────────────────────────────────────────────

  function setState(next: LoopState) {
    _state = next;
    events.emit("state", { state: next });
    onStateChange?.(next);
  }

  function waitForHuman(
    reason: HumanAwaitingReason,
    turnIndex: number,
  ): Promise<string> {
    _humanInputPromise = new Promise<string>((resolve) => {
      _humanInputResolve = resolve;
    });
    setState("awaiting-human");
    events.emit("humanAwaiting", { reason, turnIndex });
    return _humanInputPromise;
  }

  function resolveHuman(message: string) {
    _humanInputResolve?.(message);
    _humanInputResolve = null;
    _humanInputPromise = null;
  }

  // ─── Append helpers ───────────────────────────────────────────────────────

  function appendHuman(content: string, turnIndex: number): ChatMessage {
    return store.append({
      speaker: "human",
      role: "user",
      content,
      turnIndex,
    });
  }

  // ─── Main loop ────────────────────────────────────────────────────────────

  async function start(): Promise<ChatMessage[]> {
    if (_state !== "idle") {
      throw new Error("[agent-chat] Conversation has already started.");
    }

    store.append({
      speaker: "human",
      role: "user",
      content: topic,
      turnIndex: -1,
    });

    for (let turnIndex = 0; turnIndex < maxTurns; turnIndex++) {
      if (_stopped) break;

      const speakerName = participants[turnIndex % participants.length]!;
      const agent = bus.get(speakerName);

      // ── Human turn ────────────────────────────────────────────────────────
      if (agent.type === "human") {
        const humanMsg = await waitForHuman("humanTurn", turnIndex);
        if (_stopped) break;
        if (humanMsg.trim()) {
          appendHuman(humanMsg, turnIndex);
        }
        continue;
      }

      // ── LLM turn ──────────────────────────────────────────────────────────
      events.emit("turnStart", { speaker: speakerName, turnIndex });
      setState("streaming");

      const projected = store.project(speakerName, agent.system);

      let accumulated = "";
      let wasAborted  = false;
      let fatalError: unknown = null;

      for (let attempt = 1; attempt <= retryMaxAttempts; attempt++) {
        accumulated = "";
        wasAborted  = false;
        let turnError: unknown = null;

        const controller = manager.create(turnIndex);

        try {
          for await (const chunk of agent.adapter!.generate(
            projected,
            controller.signal,
          )) {
            accumulated += chunk;
            events.emit("token", { speaker: speakerName, chunk, turnIndex });
            onToken?.(chunk, speakerName);

            // Stop-sequence: mark stopped and break — never retry
            if (stopSequence && accumulated.includes(stopSequence)) {
              accumulated = accumulated.replace(stopSequence, "").trimEnd();
              _stopped       = true;
              _stopReason    = "stopSequence";
              _stopTurnIndex = turnIndex;
              break;
            }

            // Interrupt fast-path: never retry
            if (_pendingInterrupt !== null) break;
          }
        } catch (err: unknown) {
          const isAbort = err instanceof Error && err.name === "AbortError";
          if (isAbort) wasAborted = true;
          else         turnError  = err;
        }

        manager.release(turnIndex);

        // Clean exit: success, stop-sequence hit, or user abort — never retry
        if (_stopped || wasAborted || turnError === null) break;

        // Determine whether to retry
        const isLast = attempt >= retryMaxAttempts;
        if (isLast || !retryShouldRetry(turnError, attempt)) {
          fatalError = turnError;
          break;
        }

        // Fire retry event/hook before sleeping
        const delay = retryDelay(attempt);
        const retryCtx: RetryContext = {
          speaker: speakerName,
          turnIndex,
          attempt,
          maxAttempts: retryMaxAttempts,
          error: turnError,
          delayMs: delay,
        };
        events.emit("retry", retryCtx);
        options.onRetry?.(retryCtx);

        if (delay > 0) await sleep(delay, manager.signal());
        if (_stopped) break; // stop() called during back-off sleep
      }

      if (fatalError !== null) {
        events.emit("error", { error: fatalError, speaker: speakerName, turnIndex });
        _stopped = true;
        if (_stopReason === null) _stopReason = "error";
        if (_stopTurnIndex === null) _stopTurnIndex = turnIndex;
      }

      // Commit the turn — partial if aborted or interrupted
      const isPartial = wasAborted || _pendingInterrupt !== null;

      const turn = store.append({
        speaker: speakerName,
        role: "assistant",
        content: accumulated,
        turnIndex,
        ...(isPartial ? { partial: true } : {}),
      });

      events.emit("turnComplete", { turn });
      onTurnComplete?.(turn);

      // If a human interrupted mid-stream, inject their message now.
      if (_pendingInterrupt !== null) {
        appendHuman(_pendingInterrupt, turnIndex);
        _pendingInterrupt = null;
        if (_stopped) break;
        continue;
      }

      if (_stopped) break;

      // ── Delay between turns (if configured) ───────────────────────────────
      if (delayMs > 0 && turnIndex < maxTurns - 1) {
        setState("idle");
        await sleep(delayMs);
        if (_pendingIdleMessage !== null) {
          appendHuman(_pendingIdleMessage, turnIndex);
          _pendingIdleMessage = null;
          if (_stopped) break;
        }
      }

      // ── Pause condition check ─────────────────────────────────────────────
      if (pauseCondition) {
        const ctx: TurnContext = {
          turnIndex,
          speaker: speakerName,
          lastMessage: accumulated,
          history: store.all(),
        };
        if (pauseCondition(ctx)) {
          const humanMsg = await waitForHuman("pauseCondition", turnIndex);
          if (_stopped) break;
          if (humanMsg.trim()) {
            appendHuman(humanMsg, turnIndex);
          }
        }
      }
    }

    setState("stopped");
    if (_stopReason === null) {
      _stopReason = _stopped ? "stop" : "maxTurns";
    }
    events.emit("stopped", { reason: _stopReason, turnIndex: _stopTurnIndex });
    return store.all();
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  function send(message: string): SendResult {
    if (_state === "streaming") {
      _pendingInterrupt = message;
      manager.abort();
      return {
        intent: "interrupt",
        turnIndex: manager.activeTurnIndex() ?? -1,
      };
    }

    if (_state === "awaiting-human") {
      resolveHuman(message);
      return { intent: "inject", turnIndex: -1 };
    }

    if (_state === "idle") {
      _pendingIdleMessage = message;
      return { intent: "inject", turnIndex: -1 };
    }

    return { intent: "inject", turnIndex: -1 };
  }

  function stop(): void {
    _stopped = true;
    if (_stopReason === null) _stopReason = "stop";
    if (_stopTurnIndex === null) _stopTurnIndex = manager.activeTurnIndex();
    manager.abort();
    if (_state === "awaiting-human") {
      resolveHuman("");
    }
  }

  // ─── Handle ───────────────────────────────────────────────────────────────

  return {
    start,
    send,
    stop,
    on: events.on,
    off: events.off,
    once: events.once,
    get state() {
      return _state;
    },
    get history() {
      return store.all();
    },
  };
}
