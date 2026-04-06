/**
 * @file index.ts
 * @description Core entry point for @ekaone/n-agent.
 * @author Eka Prasetia
 * @website https://prasetia.me
 * @license MIT
 */

export { createChatBus } from "./bus.js";
export { createConversation } from "./conversation.js";

export type {
  AgentAdapter,
  AgentType,
  ChatAgent,
  ChatMessage,
  ConversationHandle,
  ConversationOptions,
  CoreMessage,
  LoopState,
  SendIntent,
  SendResult,
  TurnContext,
} from "./types.js";

// Adapters are separate entry points — not re-exported from root.
// Import via: @ekaone/agent-chat/adapters/ai-sdk
