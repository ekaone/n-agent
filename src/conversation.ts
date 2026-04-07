import { randomUUID } from "node:crypto";
import type {
  ChatMessage,
  ConversationOptions,
  ConversationHandle,
  LoopState,
  SendResult,
  TurnContext,
} from "./types.js";
import type { ChatBus } from "./bus.js";
import { createMessageStore } from "./history.js";
import { createAbortManager } from "./manager.js";

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

  let _state: LoopState = "idle";
  let _stopped = false;

  // The promise/resolve pair for human input (inject or interrupt).
  // When the loop needs human input, it awaits _humanInputPromise.
  // When send() is called, it resolves _humanInputResolve.
  let _humanInputResolve: ((msg: string) => void) | null = null;
  let _humanInputPromise: Promise<string> | null = null;

  // Pending interrupt message — set by send() when state === 'streaming'
  let _pendingInterrupt: string | null = null;

  // Pending message sent during idle/between-turns delay
  let _pendingIdleMessage: string | null = null;

  // ─── Sleep helper ─────────────────────────────────────────────────────────

  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  // ─── State helpers ────────────────────────────────────────────────────────

  function setState(next: LoopState) {
    _state = next;
    onStateChange?.(next);
  }

  function waitForHuman(): Promise<string> {
    _humanInputPromise = new Promise<string>((resolve) => {
      _humanInputResolve = resolve;
    });
    setState("awaiting-human");
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

    // Seed the conversation with the topic as an opening human message.
    store.append({
      speaker: "human",
      role: "user",
      content: topic,
      turnIndex: -1, // pre-loop, not counted as a turn
    });

    for (let turnIndex = 0; turnIndex < maxTurns; turnIndex++) {
      if (_stopped) break;

      const speakerName = participants[turnIndex % participants.length]!;
      const agent = bus.get(speakerName);

      // ── Human turn ────────────────────────────────────────────────────────
      if (agent.type === "human") {
        const humanMsg = await waitForHuman();
        if (_stopped) break;
        if (humanMsg.trim()) {
          appendHuman(humanMsg, turnIndex);
        }
        continue;
      }

      // ── LLM turn ──────────────────────────────────────────────────────────
      setState("streaming");

      const projected = store.project(speakerName, agent.system);
      const controller = manager.create(turnIndex);

      let accumulated = "";
      let wasAborted = false;

      try {
        for await (const chunk of agent.adapter!.generate(
          projected,
          controller.signal,
        )) {
          accumulated += chunk;
          onToken?.(chunk, speakerName);

          // Stop-sequence detection — strip it before saving.
          if (stopSequence && accumulated.includes(stopSequence)) {
            accumulated = accumulated.replace(stopSequence, "").trimEnd();
            _stopped = true;
            break;
          }

          // Mid-stream interrupt check.
          // send() sets _pendingInterrupt and calls manager.abort(),
          // which triggers the AbortError below. We check here too
          // as a fast-path before the next chunk arrives.
          if (_pendingInterrupt !== null) break;
        }
      } catch (err: unknown) {
        // AbortError is expected — a human interrupted mid-stream.
        const isAbort = err instanceof Error && err.name === "AbortError";
        if (!isAbort) throw err;
        wasAborted = true;
      }

      manager.release(turnIndex);

      // Commit the turn — partial if aborted or interrupted.
      const isPartial = wasAborted || _pendingInterrupt !== null;

      const turn = store.append({
        speaker: speakerName,
        role: "assistant",
        content: accumulated,
        turnIndex,
        ...(isPartial ? { partial: true } : {}),
      });

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
        // Check if user sent a message during the delay
        if (_pendingIdleMessage !== null) {
          appendHuman(_pendingIdleMessage, turnIndex);
          _pendingIdleMessage = null;
          if (_stopped) break;
        }
      }

      // ── Pause condition check ─────────────────────────────────────────────
      // Fires after each LLM turn. If true, wait for human input before
      // continuing. This does not consume a turn slot.
      if (pauseCondition) {
        const ctx: TurnContext = {
          turnIndex,
          speaker: speakerName,
          lastMessage: accumulated,
          history: store.all(),
        };
        if (pauseCondition(ctx)) {
          const humanMsg = await waitForHuman();
          if (_stopped) break;
          // Only append if user typed something (interactive mode: empty = skip)
          if (humanMsg.trim()) {
            appendHuman(humanMsg, turnIndex);
          }
        }
      }
    }

    setState("stopped");
    return store.all();
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  // send() handles all three loop states:
  //   'streaming'      → interrupt (abort current LLM turn, inject message)
  //   'awaiting-human' → inject (loop is already waiting)
  //   'idle'           → store for injection after delay/between turns
  //   anything else    → no-op, returns early
  function send(message: string): SendResult {
    if (_state === "streaming") {
      // Store the message — the loop reads it after the AbortError is caught.
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

    // stopped — nothing to do
    return { intent: "inject", turnIndex: -1 };
  }

  function stop(): void {
    _stopped = true;
    manager.abort();
    // If the loop is waiting for human input, resolve with empty string
    // so the await unblocks. The loop checks _stopped immediately after.
    if (_state === "awaiting-human") {
      resolveHuman("");
    }
  }

  // ─── Handle ───────────────────────────────────────────────────────────────

  return {
    start,
    send,
    stop,
    get state() {
      return _state;
    },
    get history() {
      return store.all();
    },
  };
}
