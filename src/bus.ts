import type { ChatAgent } from "./types.js";

// ─── ChatBus ──────────────────────────────────────────────────────────────────
// Registry of agents. Lightweight — just a named lookup.
// Does not know about conversations or turns.

export function createChatBus() {
  const agents = new Map<string, ChatAgent>();

  function register(agent: ChatAgent): void {
    if (agents.has(agent.name)) {
      throw new Error(
        `[agent-chat] Agent "${agent.name}" is already registered. ` +
          `Names must be unique.`,
      );
    }
    if (agent.type === "llm" && !agent.adapter) {
      throw new Error(
        `[agent-chat] Agent "${agent.name}" has type 'llm' but no adapter provided.`,
      );
    }
    agents.set(agent.name, agent);
  }

  function get(name: string): ChatAgent {
    const agent = agents.get(name);
    if (!agent) {
      throw new Error(
        `[agent-chat] Agent "${name}" not found. ` +
          `Registered agents: ${list().join(", ") || "(none)"}`,
      );
    }
    return agent;
  }

  function has(name: string): boolean {
    return agents.has(name);
  }

  function list(): string[] {
    return [...agents.keys()];
  }

  function unregister(name: string): boolean {
    return agents.delete(name);
  }

  return { register, get, has, list, unregister };
}

export type ChatBus = ReturnType<typeof createChatBus>;
