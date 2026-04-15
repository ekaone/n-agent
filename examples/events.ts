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
  delayMs: 2000,
});

// ── Events (preferred): multiple independent listeners

let currentTurnSpeaker: string | null = null;
convo.on("turnStart", ({ speaker }) => {
  currentTurnSpeaker = speaker;
  process.stdout.write(`\n[${speaker}] `);
});

convo.on("token", ({ chunk }) => {
  process.stdout.write(chunk);
});

convo.on("turnComplete", ({ turn }) => {
  process.stdout.write(`\n${"─".repeat(50)}\n`);
  if (turn.partial) process.stdout.write("⚠️  (partial — interrupted)\n");
});

convo.on("state", ({ state }) => {
  if (state === "stopped") process.stdout.write("\n✅ Conversation ended.\n");
});

// Example of once(): run only on the first completed turn
convo.once("turnComplete", ({ turn }) => {
  process.stdout.write(`(first turn by ${turn.speaker} completed)\n`);
});

// Example of unsubscribe(): stop printing state transitions after first one
const unsubscribeStateAfterFirst = convo.on("state", ({ state }) => {
  process.stdout.write(`(state changed: ${state})\n`);
  unsubscribeStateAfterFirst();
});

// ── readline — keyboard interrupt and injection
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

console.log("🎬 Topic: Will AI make software developers more productive?");
console.log("💡 Type + Enter to interrupt anytime. Ctrl+C to stop.\n");

const history = await convo.start();

console.log(`\n📜 History: ${history.length} messages`);
rl.close();

