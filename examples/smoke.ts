import * as readline from "node:readline";
import { createChatBus, createConversation } from "../src/index.js";
import { anthropicAdapter } from "../src/adapters/anthropic.js";

const bus = createChatBus();

bus.register({
  name: "optimist",
  type: "llm",
  system: "You are an optimistic thinker. Keep responses to 2 sentences max.",
  adapter: anthropicAdapter({
    model: "claude-haiku-4-5-20251001",
    maxTokens: 150,
  }),
});

bus.register({
  name: "skeptic",
  type: "llm",
  system: "You are a critical skeptic. Keep responses to 2 sentences max.",
  adapter: anthropicAdapter({
    model: "claude-haiku-4-5-20251001",
    maxTokens: 150,
  }),
});

const convo = createConversation(bus, {
  participants: ["optimist", "skeptic"],
  topic: "Will AI make software developers more productive?",
  maxTurns: 6,

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

// ── readline — keyboard interrupt
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

// ── Start
console.log("🎬 Topic: Will AI make software developers more productive?");
console.log("💡 Type + Enter to interrupt anytime. Ctrl+C to stop.\n");

const history = await convo.start();

console.log(`\n📜 History: ${history.length} messages`);
rl.close();
