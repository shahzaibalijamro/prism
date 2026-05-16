import { Router } from "express";
import { googleSignIn, signOut, getProfile } from "../controllers/auth.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

// ─── Google Sign-In ──────────────────────────────────────────────────────────
router.post("/google", googleSignIn);

// ─── Get current user profile (requires auth) ────────────────────────────────
router.get("/profile", authMiddleware, getProfile);

// ─── Sign out (requires auth — increments tokenVersion to revoke token) ──────
router.post("/signout", authMiddleware, signOut);

export default router;