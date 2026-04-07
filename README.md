# @ekaone/n-agent

> Multi-agent conversation loop with human-in-the-loop support.

[![npm version](https://img.shields.io/npm/v/@ekaone/n-agent.svg)](https://www.npmjs.com/package/@ekaone/n-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

## Installation

```bash
npm install @ekaone/n-agent
```

```bash
yarn add @ekaone/n-agent
```

```bash
pnpm add @ekaone/n-agent
```

## Quick Start

```typescript
import {
  attachInteractiveConsole,
  createChatBus,
  createConversation,
} from "@ekaone/n-agent";
import { anthropicAdapter } from "@ekaone/n-agent/adapters/anthropic";

// 1. Create a chat bus to register agents
const bus = createChatBus();

// 2. Register LLM agents
bus.register({
  name: "scientist",
  type: "llm",
  system: "You are a scientist. Keep responses brief.",
  adapter: anthropicAdapter({ model: "claude-haiku-4-5-20251001", maxTokens: 150 }),
});

bus.register({
  name: "philosopher",
  type: "llm",
  system: "You are a philosopher. Keep responses brief.",
  adapter: anthropicAdapter({ model: "claude-haiku-4-5-20251001", maxTokens: 150 }),
});

// 3. Create a conversation
const convo = createConversation(bus, {
  participants: ["scientist", "philosopher"],
  topic: "What is consciousness?",
  maxTurns: 6,
});

// 4. Attach interactive console (optional, for CLI usage)
const rl = attachInteractiveConsole(convo);

// 5. Start the conversation
await convo.start();
rl.close();
```

## API Reference

### `createChatBus()`

Creates a registry for agents.

```typescript
const bus = createChatBus();
```

**Methods:**
- `bus.register(agent: ChatAgent): void` — Register an agent
- `bus.get(name: string): ChatAgent` — Get an agent by name
- `bus.has(name: string): boolean` — Check if agent exists

### `createConversation(bus, options)`

Creates a conversation loop between registered agents.

```typescript
const convo = createConversation(bus, {
  participants: ["agent1", "agent2"],
  topic: "Discussion topic",
  maxTurns: 10,
  delayMs: 2000,
  pauseCondition: (ctx) => ctx.turnIndex % 3 === 2,
  onToken: (chunk, speaker) => process.stdout.write(chunk),
  onTurnComplete: (turn) => console.log(turn.content),
  onStateChange: (state) => console.log("State:", state),
});
```

#### ConversationOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `participants` | `string[]` | required | Ordered list of agent names defining turn rotation |
| `topic` | `string` | required | Opening message to seed the conversation |
| `maxTurns` | `number` | `10` | Maximum number of turns before auto-stopping |
| `delayMs` | `number` | `0` | Delay between turns in milliseconds |
| `stopSequence` | `string` | — | String that triggers immediate stop when generated |
| `pauseCondition` | `(ctx: TurnContext) => boolean` | — | Function to pause for human input |
| `onToken` | `(chunk: string, speaker: string) => void` | — | Called for each token streamed from LLM |
| `onTurnComplete` | `(turn: ChatMessage) => void` | — | Called when a turn finishes |
| `onStateChange` | `(state: LoopState) => void` | — | Called when conversation state changes |

### `attachInteractiveConsole(convo, config?)`

Attaches readline interface for CLI interaction. Provides real-time message injection and interrupt capabilities.

```typescript
const rl = attachInteractiveConsole(convo, {
  feedback: true,              // Show interrupt/inject messages
  interruptMessage: "⚡ Interrupted!",
  injectMessage: "💬 Message sent.",
});

// User can:
// - Type + Enter to inject a message or interrupt current LLM
// - Ctrl+C to stop gracefully

await convo.start();
rl.close();
```

## Conversation Modes

### 1. Continuous Mode (default)

Agents take turns automatically until `maxTurns` is reached.

```typescript
const convo = createConversation(bus, {
  participants: ["agent1", "agent2", "agent3"],
  topic: "Let's discuss AI.",
  maxTurns: 12,
  delayMs: 1000,  // 1 second pause between turns
});
```

### 2. Turn-by-Turn Mode (`pauseCondition`)

Pause after each turn for human approval or input.

```typescript
const convo = createConversation(bus, {
  participants: ["agent1", "agent2"],
  topic: "Step-by-step discussion.",
  pauseCondition: () => true,  // Pause after every turn
  // Or: pause every 3rd turn
  // pauseCondition: (ctx) => ctx.turnIndex % 3 === 2,
});

const rl = attachInteractiveConsole(convo);
await convo.start();
rl.close();
```

**TurnContext:**
```typescript
interface TurnContext {
  turnIndex: number;      // Current turn number
  speaker: string;          // Current agent name
  lastMessage: string;     // Full content of last message
  history: ChatMessage[];  // Complete conversation history
}
```

### 3. Human-in-the-Loop Mode

Register a human agent that waits for user input as a participant.

```typescript
// Register human agent in the rotation
bus.register({ name: "human", type: "human" });

const convo = createConversation(bus, {
  participants: ["agent1", "human", "agent2"],  // Human takes a turn
  topic: "Hello everyone!",
  maxTurns: 10,
});

const rl = attachInteractiveConsole(convo);
await convo.start();  // Pauses when it's human's turn
rl.close();
```

### 4. Interrupt Mode

Users can interrupt ongoing LLM generation mid-stream.

```typescript
const convo = createConversation(bus, {
  participants: ["agent1", "agent2"],
  topic: "Rapid fire discussion.",
  onTurnComplete: (turn) => {
    if (turn.partial) console.log("(interrupted)");
  },
});

const rl = attachInteractiveConsole(convo);
await convo.start();
// While agent is speaking, type and press Enter to interrupt
rl.close();
```

## Complete Example: Colored Multi-Agent Debate

```typescript
import {
  attachInteractiveConsole,
  createChatBus,
  createConversation,
} from "@ekaone/n-agent";
import { anthropicAdapter } from "@ekaone/n-agent/adapters/anthropic";

const bus = createChatBus();

// Color coding for each participant
const colors: Record<string, string> = {
  physicist: "\x1b[36m",   // Cyan
  philosopher: "\x1b[35m", // Magenta
  economist: "\x1b[33m",   // Yellow
  reset: "\x1b[0m",
};

function colorize(name: string): string {
  const c = colors[name] || "";
  return `${c}[${name}]${colors.reset}`;
}

// Register 3 experts
bus.register({
  name: "physicist",
  type: "llm",
  system: "You are a theoretical physicist...",
  adapter: anthropicAdapter({ model: "claude-haiku-4-5-20251001", maxTokens: 150 }),
});

bus.register({
  name: "philosopher",
  type: "llm",
  system: "You are a philosopher...",
  adapter: anthropicAdapter({ model: "claude-haiku-4-5-20251001", maxTokens: 150 }),
});

bus.register({
  name: "economist",
  type: "llm",
  system: "You are an economist...",
  adapter: anthropicAdapter({ model: "claude-haiku-4-5-20251001", maxTokens: 150 }),
});

// Track speaker for colored output
let currentSpeaker = "";
let firstToken = true;

const convo = createConversation(bus, {
  participants: ["physicist", "philosopher", "economist"],
  topic: "Should humanity colonize Mars?",
  maxTurns: 9,
  delayMs: 2000,  // 2 second pause between turns

  onToken: (chunk, speaker) => {
    // Print speaker name once per turn with color
    if (speaker !== currentSpeaker) {
      currentSpeaker = speaker;
      firstToken = true;
    }
    if (firstToken) {
      process.stdout.write(`\n${colorize(speaker)} `);
      firstToken = false;
    }
    process.stdout.write(chunk);
  },

  onTurnComplete: (turn) => {
    console.log(`\n${"─".repeat(50)}`);
    if (turn.partial) console.log("⚠️ (interrupted)");
  },

  onStateChange: (state) => {
    if (state === "stopped") console.log("\n✅ Conversation ended.");
  },
});

// Enable interactive CLI
const rl = attachInteractiveConsole(convo);

console.log("🚀 Topic: Mars colonization debate");
console.log("💡 Type + Enter to interrupt. Ctrl+C to stop.\n");

const history = await convo.start();
console.log(`\n📜 Total messages: ${history.length}`);
rl.close();
```

## Adapters

Adapters bridge the framework to LLM providers. Currently available:

### Anthropic

```typescript
import { anthropicAdapter } from "@ekaone/n-agent/adapters/anthropic";

bus.register({
  name: "claude",
  type: "llm",
  system: "You are helpful.",
  adapter: anthropicAdapter({
    model: "claude-3-sonnet-20250219",
    maxTokens: 500,
    apiKey: process.env.ANTHROPIC_API_KEY,  // or auto from env
  }),
});
```

### AI SDK (Vercel)

```typescript
import { openaiAdapter } from "@ekaone/n-agent/adapters/ai-sdk";

bus.register({
  name: "gpt",
  type: "llm",
  adapter: openaiAdapter({ model: "gpt-4o-mini" }),
});
```

## Type Definitions

```typescript
type AgentType = "llm" | "human";

interface ChatAgent {
  name: string;
  type: AgentType;
  system?: string;
  adapter?: AgentAdapter;
}

interface ConversationHandle {
  start(): Promise<ChatMessage[]>;
  send(message: string): SendResult;
  stop(): void;
  readonly state: LoopState;
  readonly history: ChatMessage[];
}

type LoopState = "idle" | "streaming" | "awaiting-human" | "stopped";

type SendResult = {
  intent: "inject" | "interrupt";
  turnIndex: number;
};
```

## License

MIT © [Eka Prasetia](https://prasetia.me/)

## Links

- [npm Package](https://www.npmjs.com/package/@ekaone/n-agent)
- [GitHub Repository](https://github.com/ekaone/n-agent)
- [Issue Tracker](https://github.com/ekaone/n-agent/issues)

---

⭐ If this library helps you, please consider giving it a star on GitHub!
