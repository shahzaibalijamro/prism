import { Router } from "express";
import { getUserChats, getChatDetail, deleteChat } from "../controllers/chat.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

// ─── Fetch all chats for the authenticated user ──────────────────────────────
router.get("/", authMiddleware, getUserChats);

// ─── Get chat detail ─────────────────────────────────────────────────────────
router.get("/:conversationId", authMiddleware, getChatDetail);

// ─── Delete a chat with cascade ──────────────────────────────────────────────
router.delete("/:conversationId", authMiddleware, deleteChat);

export default router;