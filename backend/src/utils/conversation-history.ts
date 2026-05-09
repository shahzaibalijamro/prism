import { redis } from "../config/config.js";

const CONVERSATION_TTL = 60 * 60 * 2;

type Role = "user" | "assistant" | "system";
interface Message {
  role: Role;
  content: string;
}

const HISTORY_KEY = (id: string) => `conversation:${id}`;

// Fetch history from Redis
export async function getHistory(
  conversationId: string,
): Promise<{ messages: Message[]; isExpired: boolean }> {
  const raw = await redis.get(HISTORY_KEY(conversationId));
  if (!raw) return { messages: [], isExpired: true };
  return {
    messages: typeof raw === "string" ? JSON.parse(raw) : raw,
    isExpired: false,
  };
}

// Append new messages and persist
export async function saveHistory(
  conversationId: string,
  messages: Message[],
): Promise<void> {
  await redis.set(HISTORY_KEY(conversationId), JSON.stringify(messages), {
    ex: CONVERSATION_TTL,
  });
}

// Keep only last N message-pairs to avoid blowing the token limit
export function trimHistory(messages: Message[], maxPairs = 10): Message[] {
  if (messages.length <= maxPairs * 2) return messages;
  return messages.slice(-(maxPairs * 2)); // sliding window
}
