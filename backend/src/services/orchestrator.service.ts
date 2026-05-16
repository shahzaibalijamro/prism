// src/services/orchestrator.service.ts
import type { Server } from "socket.io";
import { createEmbeddings } from "../utils/embeddings.js";
import { storeMessage } from "./message.service.js";
import { updateConversationSummary, updateConversationTitle } from "./conversation.service.js";
import { SessionModel } from "../models/session.model.js";
import { ConversationModel } from "../models/conversation.model.js";
import { DevilsAdvocateAgent, EconomistAgent, VisionaryAgent, ConsumerPsychologistAgent, OperationsPragmatistAgent } from "../agents/index.js";
import type { BaseAgent, AgentOutput } from "../agents/base.agent.js";
import { genAI } from "../config/config.js";
import logger from "../config/logger.js";
import {
  getHistory,
  saveHistory,
  trimHistory,
} from "../utils/conversation-history.js";
import {
  ResearcherAgent,
  type ResearcherOutput,
} from "../agents/researcher.agent.js";

// ─── Synthesis prompt ──────────────────────────────────────────────────────────
const SYNTHESIS_SYSTEM = `You are the Synthesis Engine for PRISM, a multi-agent intelligence platform.
You receive a user's question and the outputs of multiple specialist agents across two rounds of analysis.
Your job is to produce a final, integrated response that:
- Opens with the core tension or decision the user faces (one sentence).
- Synthesises the most important insights from all agents — do not list agents mechanically; weave their perspectives together thematically.
- Identifies where agents agreed and where they diverged, and what that divergence reveals.
- Closes with a clear, direct recommendation or conclusion. Do not end with "ultimately it's your decision" — take a position.
Write in clear, direct prose. No bullet points. No headers. Between 200 and 350 words.`;

// ─── Orchestrator ──────────────────────────────────────────────────────────────

export class OrchestratorService {
  private agents: BaseAgent[];
  private io: Server;

  constructor(io: Server) {
    this.io = io;

    // ← Adding a new agent to PRISM = add one line here
    this.agents = [
      new ResearcherAgent(), // ← runs first in Round 1
      new DevilsAdvocateAgent(),
      new EconomistAgent(),
      new VisionaryAgent(),
      new ConsumerPsychologistAgent(),
      new OperationsPragmatistAgent(),
    ];
  }

  async run(
    query: string,
    sessionId: string,
    socketId?: string,
    searchMode?: "off" | "basic" | "advanced",
    userId?: string,
  ): Promise<{
    round1: AgentOutput[];
    round2: AgentOutput[];
    synthesis: string;
  }> {
    // ── Determine active agents based on searchMode ────────────────────────
    // "off" → skip ResearcherAgent entirely; "basic"/"advanced" → include it
    const searchDepth: "basic" | "advanced" =
      searchMode === "advanced" ? "advanced" : "basic";
    const activeAgents =
      searchMode === "off"
        ? this.agents.filter((a) => a.name !== "Researcher")
        : this.agents;

    logger.info("Orchestrator starting", {
      sessionId,
      agentCount: activeAgents.length,
      searchMode: searchMode ?? "basic",
    });

    // ── 0. Create embeddings once — shared across all agents ────────────────
    // Every agent uses the same query embedding for memory retrieval.
    // This means one API call, not one per agent.
    const queryEmbedding = await createEmbeddings(query);
    if (!queryEmbedding) throw new Error("Could not create query embeddings");

    // ── 0b. Persist the user message once ───────────────────────────────────
    // Each agent should NOT store the user message — only the orchestrator does.
    // Otherwise you'd get N duplicate user messages in MongoDB.
    await storeMessage(sessionId, "user", query, queryEmbedding, userId);
    const { messages: recentHistory } = await getHistory(sessionId);

    // ── 0c. Create session record ────────────────────────────────────────────
    await SessionModel.updateOne(
      { sessionId },
      {
        query,
        embedding: queryEmbedding,
        round1: [],
        round2: [],
        synthesis: "",
        researchSources: [],
        status: "running",
        ...(userId ? { userId } : {}),
      },
      { upsert: true },
    );

    // ── 0d. Create conversation record early (truncated-prompt title as fallback) ──
    // This ensures the document exists in MongoDB before the frontend fetches chats.
    // The Groq-generated title overwrites this immediately below.
    const fallbackTitle = query.replace(/\s+/g, " ").trim().slice(0, 54) || "Untitled";
    await ConversationModel.updateOne(
      { conversationId: sessionId },
      {
        $setOnInsert: { title: fallbackTitle, ...(userId ? { userId } : {}) },
        $set: { updatedAt: new Date() },
      },
      { upsert: true },
    );

    // ── 0e. Generate chat title via Groq BEFORE Round 1 ──────────────────────────
    // Title is the first thing the user sees updated — generate it early, not at the end.
    // This runs in ~1s with llama-3.1-8b-instant and emits to the frontend immediately.
    const generatedTitle = await updateConversationTitle(sessionId, query);
    this.emit(socketId, "title:update", { title: generatedTitle, sessionId });

    this.emit(socketId, "session:start", {
      sessionId,
      agents: activeAgents.map((a) => a.name),
    });

    // ── Round 1: all agents analyze independently, in parallel ───────────────
    // Promise.all fires all agents at the same time.
    // You are not waiting for Devil's Advocate to finish before Economist starts.
    this.emit(socketId, "round:start", { round: 1 });

    const round1Results = await this.executeRound({
      round: 1,
      query,
      sessionId,
      queryEmbedding,
      otherAgentOutputs: [],
      agents: activeAgents,
      searchDepth,
      ...(socketId && { socketId }),
    });

    // Extract and emit research sources separately
    const researcherOutput = round1Results.find(
      (o) => o.agentName === "Researcher",
    ) as ResearcherOutput | undefined;
    if (researcherOutput?.sources?.length) {
      this.emit(socketId, "research:sources", {
        sources: researcherOutput.sources,
      });
    }

    this.emit(socketId, "round:complete", { round: 1, results: round1Results });

    // ── Round 2: agents read each other's Round 1 outputs ────────────────────
    // Each agent receives ALL Round 1 outputs. The base class filters out
    // the agent's own output before injecting cross-context.
    this.emit(socketId, "round:start", { round: 2 });

    const round2Results = await this.executeRound({
      round: 2,
      query,
      sessionId,
      queryEmbedding,
      otherAgentOutputs: round1Results,
      agents: activeAgents,
      searchDepth,
      ...(socketId && { socketId }),
    });

    this.emit(socketId, "round:complete", { round: 2, results: round2Results });

    // ── Synthesis ─────────────────────────────────────────────────────────────
    this.emit(socketId, "synthesis:start", {});
    const synthesis = await this.synthesize(
      query,
      round1Results,
      round2Results,
    );
    this.emit(socketId, "session:complete", { synthesis });

    // ── Persist final session state ───────────────────────────────────────────
    await SessionModel.updateOne(
      { sessionId },
      {
        round1: round1Results,
        round2: round2Results,
        synthesis,
        researchSources: researcherOutput?.sources ?? [],
        status: "complete",
      },
    );

    // ── Update conversation summary (fire and forget) ─────────────────────────
    // Pass the synthesis as the "assistant message" for the summary
    updateConversationSummary(sessionId, query, synthesis, userId).catch((err) =>
      logger.error("Summary update failed", err),
    );


    saveHistory(
      sessionId,
      trimHistory([
        ...recentHistory,
        { role: "user" as const, content: query },
        { role: "assistant" as const, content: synthesis },
      ]),
    ).catch((err) => logger.error("Redis history save failed", err));

    logger.info("Orchestrator complete", { sessionId });
    return { round1: round1Results, round2: round2Results, synthesis };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async executeRound({
    round,
    query,
    sessionId,
    queryEmbedding,
    otherAgentOutputs,
    agents,
    searchDepth,
    socketId,
  }: {
    round: 1 | 2;
    query: string;
    sessionId: string;
    queryEmbedding: number[];
    otherAgentOutputs: AgentOutput[];
    agents: BaseAgent[];
    searchDepth: "basic" | "advanced";
    socketId?: string;
  }): Promise<AgentOutput[]> {
    const results = await Promise.all(
      agents.map(async (agent) => {
        try {
          const output = await agent.run({
            sessionId,
            query,
            round,
            queryEmbedding,
            otherAgentOutputs,
            searchDepth,
          });

          // Emit each agent's completion as it finishes
          // (agents finish at different times — emit immediately, don't batch)
          this.emit(socketId, "agent:complete", { round, ...output });

          return output;
        } catch (err) {
          logger.error(`Agent failed`, { agentName: agent.name, round, err });
          // Return a graceful fallback so one agent failure doesn't kill the session
          return {
            agentName: agent.name,
            content: `[${agent.name} encountered an error and could not respond for this round.]`,
            latencyMs: 0,
          };
        }
      }),
    );

    return results;
  }

  private async synthesize(
    query: string,
    round1: AgentOutput[],
    round2: AgentOutput[],
  ): Promise<string> {
    const formatRound = (outputs: AgentOutput[], roundLabel: string) =>
      outputs
        .map((o) => `[${roundLabel} — ${o.agentName}]\n${o.content}`)
        .join("\n\n---\n\n");

    const prompt = `User's question: "${query}"

${formatRound(round1, "Round 1")}

${formatRound(round2, "Round 2")}

Based on all of the above, provide your synthesis.`;

    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: SYNTHESIS_SYSTEM,
        temperature: 0.4,
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    return parts.map((p) => p.text ?? "").join("") || "Synthesis unavailable.";
  }

  // Null-safe emit — if no socketId provided, we just skip (REST-only mode)
  private emit(socketId: string | undefined, event: string, data: object) {
    if (socketId) {
      this.io.to(socketId).emit(event, data);
    }
  }
}
