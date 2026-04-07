import {
  attachInteractiveConsole,
  createChatBus,
  createConversation,
} from "../src/index.js";
import { anthropicAdapter } from "../src/adapters/anthropic.js";

const bus = createChatBus();

// ANSI color codes for participants
const colors: Record<string, string> = {
  physicist: "\x1b[36m", // Cyan
  philosopher: "\x1b[35m", // Magenta
  economist: "\x1b[33m", // Yellow
  human: "\x1b[32m", // Green
  reset: "\x1b[0m",
};

function colorize(name: string): string {
  const c = colors[name] || "";
  return `${c}[${name}]${colors.reset}`;
}

bus.register({
  name: "physicist",
  type: "llm",
  system:
    "You are a theoretical physicist focused on the fundamental laws of the universe, quantum mechanics, and cosmology. Keep responses brief and grounded in scientific principles.",
  adapter: anthropicAdapter({
    model: "claude-haiku-4-5-20251001",
    maxTokens: 150,
  }),
});

bus.register({
  name: "philosopher",
  type: "llm",
  system:
    "You are a philosopher who questions the nature of existence, consciousness, and humanity's place in the cosmos. Keep responses brief and thought-provoking.",
  adapter: anthropicAdapter({
    model: "claude-haiku-4-5-20251001",
    maxTokens: 150,
  }),
});

bus.register({
  name: "economist",
  type: "llm",
  system:
    "You are an economist who analyzes space exploration through the lens of resource allocation, investment returns, and market incentives. Keep responses brief and practical.",
  adapter: anthropicAdapter({
    model: "claude-haiku-4-5-20251001",
    maxTokens: 150,
  }),
});

// Track current speaker for coloring
let currentSpeaker = "";
let firstToken = true;

const convo = createConversation(bus, {
  participants: ["physicist", "philosopher", "economist"],
  topic:
    "Should humanity prioritize colonizing Mars or focus on solving Earth's problems first?",
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
    if (state === "stopped") console.log("\n✅ Conversation ended.");
  },
});

const rl = attachInteractiveConsole(convo);

console.log("🚀 Topic: Mars colonization vs Earth's priorities?");
console.log("💡 Type + Enter to interrupt anytime. Ctrl+C to stop.\n");

const history = await convo.start();

console.log(`\n📜 History: ${history.length} messages`);
rl.close();
