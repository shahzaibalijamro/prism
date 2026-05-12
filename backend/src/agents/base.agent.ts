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
export interface AgentRunContext {
  sessionId: string;
  query: string;
  round: 1 | 2;
  queryEmbedding: number[];
  // Only populated in round 2 — what every OTHER agent said in round 1
  otherAgentOutputs?: AgentOutput[];
}

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
    const { messages: recentHistory } = await getHistory(sessionId);
    const relevantMessages = await retrieveRelevantMessages(
      sessionId,
      queryEmbedding,
      5,
    );

    const recentContents = new Set(recentHistory.map((m) => m.content));
    const semanticContext = relevantMessages
      .filter((m) => !recentContents.has(m.content))
      .map(({ role, content }) => ({ role, content }));

    const fullContext = [...semanticContext, ...recentHistory];

    // ── 2. Build messages ────────────────────────────────────────────────────
    const messagesForLLM: ChatCompletionMessageParam[] = [
      { role: "system", content: this.systemPrompt },
    ];

    // Inject conversation summary if it exists
    const conversation = await ConversationModel.findOne({ conversationId: sessionId });
    if (conversation?.summary) {
      messagesForLLM.push({
        role: "system",
        content: `[Conversation summary so far: ${conversation.summary}]`,
      });
    }

    // ── 3. Round 2 cross-agent context ───────────────────────────────────────
    // In round 2, each agent receives every OTHER agent's round 1 output.
    // This is what creates the "debate" — agents can agree, challenge, or build.
    if (round === 2 && otherAgentOutputs.length > 0) {
      const crossContext = otherAgentOutputs
        .filter((o) => o.agentName !== this.name) // exclude own round 1 output
        .map((o) => `**${o.agentName}:**\n${o.content}`)
        .join("\n\n---\n\n");

      messagesForLLM.push({
        role: "system",
        content: `[Round 1 — other agents' perspectives on the same question:\n\n${crossContext}\n\nYou are now in Round 2. Reference specific points from other agents where you agree, disagree, or want to build upon. Do not simply repeat your Round 1 analysis.]`,
      });
    }

    messagesForLLM.push(...fullContext);
    messagesForLLM.push({ role: "user", content: query });

    logger.debug(`[${this.name}] Round ${round} — sending ${messagesForLLM.length} messages to LLM`);

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
    logger.info(`[${this.name}] Round ${round} complete`, { latencyMs, sessionId });

    return { agentName: this.name, content, latencyMs };
  }
}
