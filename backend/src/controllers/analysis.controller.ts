// src/controllers/analysis.controller.ts
import z from "zod";
import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { v4 as uuidv4 } from "uuid";
import { sendError, sendSuccess } from "../utils/response-handler.js";
import { OrchestratorService } from "../services/orchestrator.service.js";
import logger from "../config/logger.js";
import type { Server } from "socket.io";

const analysisSchema = z.object({
  query: z.string().min(5),
  sessionId: z.string().uuid().optional(),
  // The frontend sends its socket.id here so the orchestrator knows where to stream
  socketId: z.string().optional(),
  // Search mode: "off" skips ResearcherAgent, "basic"/"advanced" configures Tavily depth
  searchMode: z.enum(["off", "basic", "advanced"]).default("off"),
});

// Factory: controller is created once with `io` injected
// This avoids a global import and keeps the dependency explicit
export function createAnalysisController(io: Server) {
  const orchestrator = new OrchestratorService(io);

  return async (req: Request, res: Response) => {
    // userId is set by authMiddleware
    const userId = (req as unknown as AuthenticatedRequest).userId;

    const parsed = analysisSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, "Invalid input", parsed.error.message);
    }

    const { query, sessionId: existingId, socketId, searchMode } = parsed.data;
    const sessionId = existingId ?? uuidv4();

    try {
      // Pass userId to orchestrator so it can associate conversation/session with the user
      const result = await orchestrator.run(query, sessionId, socketId, searchMode, userId);
      return sendSuccess(res, 200, { sessionId, ...result });
    } catch (error) {
      logger.error("Analysis failed", error);
      return sendError(res, 500, "Analysis failed");
    }
  };
}