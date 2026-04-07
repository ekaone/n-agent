import {
  attachInteractiveConsole,
  createChatBus,
  createConversation,
} from "../src/index.js";
import { anthropicAdapter } from "../src/adapters/anthropic.js";

// ANSI color codes for participants
const colors: Record<string, string> = {
  keynesian: "\x1b[36m", // Cyan
  austrian: "\x1b[35m", // Magenta
  technologist: "\x1b[33m", // Yellow
  human: "\x1b[32m", // Green
  reset: "\x1b[0m",
};

function colorize(name: string): string {
  const c = colors[name] || "";
  return `${c}[${name}]${colors.reset}`;
}

const bus = createChatBus();

// Track current speaker for coloring
let currentSpeaker = "";
let firstToken = true;

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
  topic:
    "How should society respond to widespread AI automation and potential job displacement?",
  maxTurns: 9,
  delayMs: 2000,
  // pauseCondition: () => true,

  onToken: (chunk, speaker) => {
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
    if (turn.partial) console.log("⚠️  (partial — interrupted)");
  },

  onStateChange: (state) => {
    if (state === "streaming") process.stdout.write("\n");
    if (state === "stopped") console.log("\n✅ Conversation ended.");
  },
});

const rl = attachInteractiveConsole(convo);

console.log("💰 Topic: AI, Automation, and the Future of Work?");
console.log("💡 Type + Enter to interrupt anytime. Ctrl+C to stop.\n");

const history = await convo.start();

console.log(`\n📜 History: ${history.length} messages`);
rl.close();
