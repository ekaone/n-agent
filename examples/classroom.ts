import { createChatBus, createConversation } from "../src/index.js";
import { anthropicAdapter } from "../src/adapters/anthropic.js";

const colors: Record<string, string> = {
  teacher: "\x1b[34m", // Blue
  student: "\x1b[32m", // Green
  reset: "\x1b[0m",
};
function colorize(name: string): string {
  const c = colors[name] || "";
  return `${c}[${name}]${colors.reset}`;
}

const bus = createChatBus();

bus.register({
  name: "teacher",
  type: "llm",
  system:
    "You are a friendly math teacher. Teach step-by-step, ask one short question at a time, and keep answers concise.",
  adapter: anthropicAdapter({
    model: "claude-haiku-4-5-20251001",
    maxTokens: 180,
  }),
});

bus.register({
  name: "student",
  type: "llm",
  system:
    "You are a curious student. Answer briefly, show your work, and ask for clarification when confused.",
  adapter: anthropicAdapter({
    model: "claude-haiku-4-5-20251001",
    maxTokens: 180,
  }),
});

const convo = createConversation(bus, {
  participants: ["teacher", "student"],
  topic:
    "Teach addition using a simple example: 7 + 5. The teacher should explain, then ask the student to solve 9 + 6.",
  maxTurns: 6,
  delayMs: 500,
});

// Use the new typed events API
convo.on("turnStart", ({ speaker }) => {
  process.stdout.write(`\n${colorize(speaker)} `);
});

convo.on("token", ({ chunk }) => {
  process.stdout.write(chunk);
});

convo.on("turnComplete", ({ turn }) => {
  process.stdout.write(`\n${"─".repeat(50)}\n`);
  if (turn.partial) process.stdout.write("⚠️  (partial — interrupted)\n");
});

convo.on("stopped", ({ reason }) => {
  process.stdout.write(`\n✅ Stopped: ${reason}\n`);
});

console.log("🏫 Classroom: Addition (teacher ↔ student)");
const history = await convo.start();
console.log(`\n📜 History: ${history.length} messages`);
