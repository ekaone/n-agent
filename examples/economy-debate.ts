import * as readline from "node:readline";
import { createChatBus, createConversation } from "../src/index.js";
import { anthropicAdapter } from "../src/adapters/anthropic.js";

const bus = createChatBus();

bus.register({
  name: "keynesian",
  type: "llm",
  system:
    "You are a Keynesian economist who believes in government intervention, fiscal stimulus, and managing aggregate demand to stabilize economies. Keep responses brief and practical.",
  adapter: anthropicAdapter({
    model: "claude-haiku-4-5-20251001",
    maxTokens: 150,
  }),
});

bus.register({
  name: "austrian",
  type: "llm",
  system:
    "You are an Austrian School economist who advocates for free markets, sound money, and minimal government intervention. Emphasize individual choice and market self-correction. Keep responses brief.",
  adapter: anthropicAdapter({
    model: "claude-haiku-4-5-20251001",
    maxTokens: 150,
  }),
});

bus.register({
  name: "technologist",
  type: "llm",
  system:
    "You are a technology optimist who believes automation, AI, and innovation will solve economic challenges and create abundance. Focus on productivity gains and new opportunities. Keep responses brief.",
  adapter: anthropicAdapter({
    model: "claude-haiku-4-5-20251001",
    maxTokens: 150,
  }),
});

const convo = createConversation(bus, {
  participants: ["keynesian", "austrian", "technologist"],
  topic: "How should society respond to widespread AI automation and potential job displacement?",
  maxTurns: 9,
  delayMs: 2000,
  // pauseCondition: () => true,

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
  const result = convo.send(msg);
  if (msg) {
    if (result.intent === "interrupt") {
      console.log("\n⚡ Interrupted — your message injected.");
    } else {
      console.log("\n💬 Message injected.");
    }
  }
});

rl.on("SIGINT", () => {
  console.log("\n🛑 Stopping...");
  convo.stop();
  rl.close();
});

console.log("💰 Topic: AI, Automation, and the Future of Work?");
console.log("💡 Type + Enter to interrupt anytime. Ctrl+C to stop.\n");

const history = await convo.start();

console.log(`\n📜 History: ${history.length} messages`);
rl.close();
