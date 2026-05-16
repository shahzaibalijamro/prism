import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { ConversationModel } from "../models/conversation.model.js";
import { MessageModel } from "../models/message.model.js";
import { SessionModel } from "../models/session.model.js";
import { redis } from "../config/config.js";
import { sendError, sendSuccess } from "../utils/response-handler.js";
import logger from "../config/logger.js";

// ─── Fetch all chats for the authenticated user ──────────────────────────────
export async function getUserChats(req: Request, res: Response) {
  try {
    const conversations = await ConversationModel.find({ userId: (req as unknown as AuthenticatedRequest).userId })
      .sort({ updatedAt: -1 })
      .lean();

    return sendSuccess(res, 200, { conversations });
  } catch (error) {
    logger.error("Failed to fetch user chats", error);
    return sendError(res, 500, "Failed to fetch chats");
  }
}

// ─── Get chat detail ─────────────────────────────────────────────────────────
// Returns the conversation, its messages, and associated session(s).
export async function getChatDetail(req: Request, res: Response) {
  // Express 5 params type is string | string[] | undefined
  const conversationId = req.params.conversationId as string;
  if (!conversationId) {
    return sendError(res, 400, "Conversation ID is required");
  }

  try {
    const conversation = await ConversationModel.findOne({
      conversationId,
      userId: (req as unknown as AuthenticatedRequest).userId,
    });

    if (!conversation) {
      return sendError(res, 404, "Conversation not found");
    }

    const messages = await MessageModel.find({ conversationId })
      .sort({ createdAt: 1 })
      .lean();

    const sessions = await SessionModel.find({
      sessionId: conversationId,
    }).lean();

    return sendSuccess(res, 200, {
      conversation,
      messages,
      sessions,
    });
  } catch (error) {
    logger.error("Failed to fetch chat detail", error);
    return sendError(res, 500, "Failed to fetch chat detail");
  }
}

// ─── Delete a chat with cascade ──────────────────────────────────────────────
// Removes the conversation document, all associated messages (with embeddings),
// all session documents, and clears Redis cache entries.
export async function deleteChat(req: Request, res: Response) {
  const conversationId = req.params.conversationId as string;
  if (!conversationId) {
    return sendError(res, 400, "Conversation ID is required");
  }

  try {
    // Verify the conversation belongs to the authenticated user
    const conversation = await ConversationModel.findOne({
      conversationId,
      userId: (req as unknown as AuthenticatedRequest).userId,
    });

    if (!conversation) {
      return sendError(res, 404, "Conversation not found or does not belong to you");
    }

    // Cascade delete: conversation, messages (with embeddings), sessions, Redis cache
    await ConversationModel.deleteOne({ conversationId, userId: (req as unknown as AuthenticatedRequest).userId });
    await MessageModel.deleteMany({ conversationId });
    await SessionModel.deleteMany({ sessionId: conversationId });

    // Clear Redis conversation cache
    await redis.del(`conversation:${conversationId}`);
    await redis.del(`conversation:${conversationId}:summary`);

    return sendSuccess(res, 200, null, "Chat deleted successfully");
  } catch (error) {
    logger.error("Failed to delete chat", error);
    return sendError(res, 500, "Failed to delete chat");
  }
}