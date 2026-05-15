// src/agents/researcher.agent.ts
import { BaseAgent } from "./base.agent.js";
import type { AgentRunContext, AgentOutput } from "./base.agent.js";
import logger from "../config/logger.js";
import { tavily } from "../config/config.js";

export type ResearchSource = {
  title: string;
  domain: string;
  url: string;
  snippet: string;
};

export type ResearcherOutput = AgentOutput & {
  sources?: ResearchSource[];
};

export class ResearcherAgent extends BaseAgent {
  readonly name = "Researcher";
  readonly model = "llama-3.3-70b-versatile";
  readonly systemPrompt = `You are the Researcher — your role is to ground analysis in current facts and evidence.

You have live web search results. Extract and present the most relevant facts, data points, and recent developments clearly and neutrally, without opinion or spin. For time-sensitive information (market trends, regulations, economic data), explicitly flag the recency and potential for change.

In Round 1, synthesize the search results into a concise summary of what's currently true about the topic. Cite sources by publication/domain. Do not speculate beyond the evidence.

In Round 2, examine the other agents' factual claims. Where your research confirms them, say so. Where it contradicts them, correct the record. Add new evidence that becomes relevant given the debate.

If the search results don't cover something the other agents claim, note that explicitly rather than filling gaps with assumptions. Your credibility depends on distinguishing between "the research shows" and "the research doesn't address this."`;

  // Override run() to inject live web results + store sources
  async run(ctx: AgentRunContext): Promise<ResearcherOutput> {
    const { query, searchDepth } = ctx;

    // Fetch live results and extract sources, using the configured depth
    const { webContext, sources } = await this.fetchWebResults(query, searchDepth ?? "basic");

    // Inject into the context so the base class pipeline sees it
    const enrichedCtx: AgentRunContext = {
      ...ctx,
      researchContext: webContext,
    };

    const output = await super.run(enrichedCtx) as ResearcherOutput;
    output.sources = sources;
    return output;
  }

  private async fetchWebResults(
    query: string,
    searchDepth: "basic" | "advanced",
  ): Promise<{ webContext: string; sources: ResearchSource[] }> {
    try {
      const response = await tavily.search(query, {
        searchDepth,
        maxResults: 5,
        includeAnswer: true,
      });

      if (!response.results?.length) {
        return {
          webContext: "[No relevant web results found for this query.]",
          sources: [],
        };
      }

      const sources: ResearchSource[] = response.results.map((result) => ({
        title: result.title,
        domain: new URL(result.url).hostname,
        url: result.url,
        snippet: result.content ?? "",
      }));

      const lines: string[] = [];

      if (response.answer) {
        lines.push(`Quick summary: ${response.answer}\n`);
      }

      response.results.forEach((result, i) => {
        lines.push(`[${i + 1}] ${result.title}`);
        lines.push(result.content);
        lines.push(`Source: ${new URL(result.url).hostname}\n`);
      });

      return {
        webContext: `[Live web search results for: "${query}"]\n\n${lines.join("\n")}`,
        sources,
      };
    } catch (err) {
      logger.warn(
        "Tavily search failed, Researcher proceeding without web context",
        err,
      );
      return {
        webContext:
          "[Web search unavailable for this session. Proceed based on training knowledge.]",
        sources: [],
      };
    }
  }
}
