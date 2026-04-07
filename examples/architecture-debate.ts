import * as readline from "node:readline";
import { createChatBus, createConversation } from "../src/index.js";
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
  delayMs: 2000,

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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.on("line", (input) => {
  const msg = input.trim();
  if (!msg) return;
  const result = convo.send(msg);
  if (result.intent === "interrupt") {
    console.log("\n⚡ Interrupted — your message injected.");
  } else {
    console.log("\n💬 Message injected.");
  }
});

rl.on("SIGINT", () => {
  console.log("\n🛑 Stopping...");
  convo.stop();
  rl.close();
});

console.log("🎬 Topic: Microservices vs Monolithic?");
console.log("💡 Type + Enter to interrupt anytime. Ctrl+C to stop.\n");

const history = await convo.start();

console.log(`\n📜 History: ${history.length} messages`);
rl.close();
