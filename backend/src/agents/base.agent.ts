// src/agents/base.agent.ts
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat.mjs";
import { groq } from "../config/config.js";
import { createEmbeddings } from "../utils/embeddings.js";
import { getHistory } from "../utils/conversation-history.js";
import {
  retrieveRelevantMessages,
  storeMessage,
} from "../services/message.service.js";
import { ConversationModel } from "../models/conversation.model.js";
import logger from "../config/logger.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AgentOutput {
  agentName: string;
  content: string;
  latencyMs: number;
}

// Everything an agent needs to know to run
// src/agents/base.agent.ts — update the interface

export interface AgentRunContext {
  sessionId: string;
  query: string;
  round: 1 | 2;
  queryEmbedding: number[];
  otherAgentOutputs?: AgentOutput[];
  researchContext?: string; // ← add this
}

const COMPRESSION_THRESHOLD = 10; // message count, not pairs
const HEAD_SIZE = 4; // first 4 messages (establishes the conversation)
const TAIL_SIZE = 6; // last 6 messages (most recent context)

// ─── Base class ────────────────────────────────────────────────────────────────

export abstract class BaseAgent {
  // Each subclass declares these — nothing else needed to create a new agent
  abstract readonly name: string;
  abstract readonly model: string;
  abstract readonly systemPrompt: string;

  async run(ctx: AgentRunContext): Promise<AgentOutput> {
    const {
      sessionId,
      query,
      round,
      queryEmbedding,
      otherAgentOutputs = [],
    } = ctx;
    const start = Date.now();

    // ── 1. Memory retrieval (identical logic to your current controller) ────
    const { messages: recentHistory, isExpired } = await getHistory(sessionId);

    // ── 2. Build messages ────────────────────────────────────────────────────
    const messagesForLLM: ChatCompletionMessageParam[] = [
      { role: "system", content: this.systemPrompt },
    ];

    if (ctx.researchContext) {
      messagesForLLM.push({
        role: "system",
        content: ctx.researchContext,
      });
    }

    if (isExpired || recentHistory.length === 0) {
      // ── State 3: Redis expired ─────────────────────────────────────────
      // We have no recent history. Fall back to summary + semantic search.
      // These two together reconstruct "what happened + what's relevant now."

      const conversation = await ConversationModel.findOne({
        conversationId: sessionId,
      });
      if (conversation?.summary) {
        messagesForLLM.push({
          role: "system",
          content: `[Conversation summary: ${conversation.summary}]`,
        });
      }

      const relevantMessages = await retrieveRelevantMessages(
        sessionId,
        queryEmbedding,
        5,
      );
      const semanticContext = relevantMessages.map(({ role, content }) => ({
        role,
        content,
      }));
      messagesForLLM.push(...semanticContext);

      logger.debug(
        `[${this.name}] Context: EXPIRED — using summary + semantic`,
      );
    } else if (recentHistory.length >= COMPRESSION_THRESHOLD) {
      const head = recentHistory.slice(0, HEAD_SIZE);
      const tail = recentHistory.slice(-TAIL_SIZE);

      // Avoid duplicates if the conversation isn't long enough to have a gap
      const compressed =
        HEAD_SIZE + TAIL_SIZE >= recentHistory.length
          ? recentHistory.slice(-TAIL_SIZE)
          : [...head, ...tail];

      const conversation = await ConversationModel.findOne({
        conversationId: sessionId,
      });
      if (conversation?.summary) {
        messagesForLLM.push({
          role: "system",
          content: `[Conversation summary (covers the full history including messages not shown below): ${conversation.summary}]`,
        });
      }

      messagesForLLM.push(...compressed);

      logger.debug(
        `[${this.name}] Context: COMPRESSED — ${recentHistory.length} → ${compressed.length} messages`,
      );
    } else {
      // ── State 1: Redis valid, history short ────────────────────────────
      // Just push the full Redis history. No semantic call needed.
      // Semantic would duplicate what's already here.

      messagesForLLM.push(...recentHistory);

      logger.debug(
        `[${this.name}] Context: NORMAL — ${recentHistory.length} messages from Redis`,
      );
    }

    // ── Round 2 cross-agent context ────────────────────────────────────────
    if (round === 2 && otherAgentOutputs.length > 0) {
      const crossContext = otherAgentOutputs
        .filter((o) => o.agentName !== this.name)
        .map((o) => `**${o.agentName}:**\n${o.content}`)
        .join("\n\n---\n\n");

      messagesForLLM.push({
        role: "system",
        content: `[Round 1 — other agents:\n\n${crossContext}\n\nYou are in Round 2. Reference specific points from other agents where relevant.]`,
      });
    }

    messagesForLLM.push({ role: "user", content: query });

    logger.debug(
      `[${this.name}] Round ${round} — sending ${messagesForLLM.length} messages to LLM`,
    );

    // ── 4. LLM call ──────────────────────────────────────────────────────────
    const response = await groq.chat.completions.create({
      model: this.model,
      messages: messagesForLLM,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error(`[${this.name}] No content returned from model`);
    }

    const latencyMs = Date.now() - start;

    // ── 5. Persist assistant message ─────────────────────────────────────────
    // Prefix with agent name so vector search results are attributable.
    // When this message surfaces as semantic context later, you'll know which
    // agent said it.
    const assistantEmbedding = await createEmbeddings(content);
    await storeMessage(
      sessionId,
      "assistant",
      `[${this.name}] ${content}`,
      assistantEmbedding ?? queryEmbedding,
    );

    // ── 6. Update Redis history ───────────────────────────────────────────────
    logger.info(`[${this.name}] Round ${round} complete`, {
      latencyMs,
      sessionId,
    });

    return { agentName: this.name, content, latencyMs };
  }
}
