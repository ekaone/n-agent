import {
  attachInteractiveConsole,
  createChatBus,
  createConversation,
} from "../src/index.js";
import { anthropicAdapter } from "../src/adapters/anthropic.js";

const bus = createChatBus();

bus.register({
  name: "architect",
  type: "llm",
  system:
    "You are a software architect focused on scalability and best practices. Keep responses brief.",
  adapter: anthropicAdapter({
    model: "claude-haiku-4-5-20251001",
    maxTokens: 150,
  }),
});

bus.register({
  name: "engineer",
  type: "llm",
  system:
    "You are a pragmatic engineer who values shipping fast. Keep responses brief.",
  adapter: anthropicAdapter({
    model: "claude-haiku-4-5-20251001",
    maxTokens: 150,
  }),
});

bus.register({
  name: "product",
  type: "llm",
  system:
    "You are a product manager focused on user needs and time-to-market. Keep responses brief.",
  adapter: anthropicAdapter({
    model: "claude-haiku-4-5-20251001",
    maxTokens: 150,
  }),
});

const convo = createConversation(bus, {
  participants: ["architect", "engineer", "product"],
  topic: "Should we build a microservices architecture or keep it monolithic?",
  maxTurns: 9,
  delayMs: 0,
  pauseCondition: () => true,

  onToken: (chunk, speaker) => {
    process.stdout.write(chunk);
  },

  onTurnComplete: (turn) => {
    console.log(`\n${"─".repeat(50)}`);
    if (turn.partial) console.log("⚠️  (partial — interrupted)");
  },

  onStateChange: (state) => {
    if (state === "streaming") process.stdout.write("\n");
    if (state === "stopped") console.log("\n✅ Conversation ended.");
  },
});

const rl = attachInteractiveConsole(convo);

console.log("🎬 Topic: Microservices vs Monolithic?");
console.log(
  "💡 Press Enter to continue, or type + Enter to inject. Ctrl+C to stop.\n",
);

const history = await convo.start();

console.log(`\n📜 History: ${history.length} messages`);
rl.close();
