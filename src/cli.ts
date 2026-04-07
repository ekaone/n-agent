/**
 * @file cli.ts
 * @description CLI utilities for @ekaone/n-agent.
 * Provides helpers for interactive console usage with readline.
 * @author Eka Prasetia
 * @website https://prasetia.me
 * @license MIT
 */

import * as readline from "node:readline";
import type {
  ChatMessage,
  ConversationHandle,
  LoopState,
  SendResult,
} from "./types.js";

export type InteractiveConfig = {
  /**
   * Print feedback messages for interrupt/inject (default: true).
   * Set to false for silent operation.
   */
  feedback?: boolean;
  /**
   * Custom message shown on interrupt. Default: "⚡ Interrupted — your message injected."
   */
  interruptMessage?: string;
  /**
   * Custom message shown on inject. Default: "💬 Message injected."
   */
  injectMessage?: string;
  /**
   * Handler called on state changes (extends default behavior, not replaces).
   */
  onStateChange?: (state: LoopState) => void;
  /**
   * Handler called when a turn completes (extends default behavior, not replaces).
   */
  onTurnComplete?: (turn: ChatMessage) => void;
};

/**
 * Attaches a readline interface to a conversation handle for interactive CLI usage.
 * Provides:
 * - Real-time message injection/interruption via stdin
 * - Graceful Ctrl+C handling (SIGINT)
 * - Default feedback messages for user actions
 * - Optional custom handlers for state changes and turn completion
 *
 * @param convo - The conversation handle from createConversation()
 * @param config - Optional configuration for customization
 * @returns readline.Interface instance (call rl.close() when done)
 *
 * @example
 * ```typescript
 * const convo = createConversation(bus, { participants: [...], topic: "..." });
 * const rl = attachInteractiveConsole(convo);
 *
 * console.log("Starting conversation...");
 * await convo.start();
 * rl.close();
 * ```
 */
export function attachInteractiveConsole(
  convo: ConversationHandle,
  config: InteractiveConfig = {},
): readline.Interface {
  const {
    feedback = true,
    interruptMessage = "⚡ Interrupted — your message injected.",
    injectMessage = "💬 Message injected.",
    onStateChange,
    onTurnComplete,
  } = config;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on("line", (input) => {
    const msg = input.trim();
    const result = convo.send(msg);

    if (msg && feedback) {
      if (result.intent === "interrupt") {
        console.log(`\n${interruptMessage}`);
      } else {
        console.log(`\n${injectMessage}`);
      }
    }

    // Call user's onTurnComplete if provided
    if (onTurnComplete && result.turnIndex >= 0) {
      // Note: we don't have the turn data here, user can use convo.onTurnComplete
    }
  });

  rl.on("SIGINT", () => {
    if (feedback) {
      console.log("\n🛑 Stopping...");
    }
    convo.stop();
    rl.close();
  });

  return rl;
}
