// ─── Core Message ───
// Aligns with what LLM providers expect. Used in history projection.

export type CoreMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

// ─── Chat Message
// The canonical record stored in history. Richer than CoreMessage.

export type ChatMessage = {
  id: string;
  speaker: string; // 'sonnet' | 'gpt' | 'human' — matches agent name
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  turnIndex: number;
  partial?: true; // set if turn was aborted before completion
};

// ─── Agent Adapter
// The only contract adapters must satisfy. Core package knows nothing else.

export type AgentAdapter = {
  generate(messages: CoreMessage[], signal: AbortSignal): AsyncIterable<string>;
};

// ─── Chat Agent

export type AgentType = "llm" | "human";

export type ChatAgent = {
  name: string;
  type: AgentType;
  system?: string; // system prompt, injected as first CoreMessage
  adapter?: AgentAdapter; // undefined when type === 'human'
};

// ─── Turn Context
// Passed to pauseCondition so users can write expressive pause logic.

export type TurnContext = {
  turnIndex: number;
  speaker: string;
  lastMessage: string;
  history: ChatMessage[];
};

// ─── Send Metadata
// Returned by convo.send() so the UI knows what kind of input it was.

export type SendIntent = "inject" | "interrupt";

export type SendResult = {
  intent: SendIntent;
  turnIndex: number;
};

// ─── Loop State
// Internal state of the conversation — exposed via convo.state

export type LoopState =
  | "idle" // not started
  | "streaming" // LLM is generating
  | "awaiting-human" // paused, waiting for send()
  | "stopped"; // terminated (maxTurns | stop() | stopSequence)

// ─── Conversation Options

export type ConversationOptions = {
  participants: string[]; // ordered agent names — defines rotation
  topic: string; // injected as the opening user message
  maxTurns?: number; // hard cap, default: 10
  stopSequence?: string; // e.g. '[DONE]' — auto-calls stop()
  pauseCondition?: (ctx: TurnContext) => boolean;
  delayMs?: number; // optional delay between turns (ms)
  onToken?: (chunk: string, speaker: string) => void;
  onTurnComplete?: (turn: ChatMessage) => void;
  onStateChange?: (state: LoopState) => void;
};

// ─── Conversation Handle
// What createConversation() returns.

export type ConversationHandle = {
  start(): Promise<ChatMessage[]>; // resolves with full history
  send(message: string): SendResult; // inject or interrupt depending on state
  stop(): void;
  readonly state: LoopState;
  readonly history: ChatMessage[];
};
