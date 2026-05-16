import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UserModel } from "../models/user.model.js";
import config from "../config/config.js";
import logger from "../config/logger.js";
import { sendError } from "../utils/response-handler.js";

// ─── Extended Request type with authenticated userId ──────────────────────────
// Defined here (not in auth.controller) to avoid circular imports.
// Controllers import this type from the middleware file.
export interface AuthenticatedRequest extends Request {
  userId: string;
}

// ─── Auth middleware ──────────────────────────────────────────────────────────
// Extracts JWT from HttpOnly cookie, verifies it, fetches the user from DB,
// compares the tokenVersion in the JWT payload against the user's DB document.
// If versions mismatch (e.g. user was "blocked" by incrementing DB version),
// the token is rejected and the cookie is cleared.
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.token as string | undefined;

  if (!token) {
    sendError(res, 401, "Authentication required — no token provided");
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret as jwt.Secret) as {
      userId: string;
      tokenVersion: number;
    };

    const user = await UserModel.findById(decoded.userId);
    if (!user) {
      res.clearCookie("token", { path: "/" });
      sendError(res, 401, "User no longer exists");
      return;
    }

    // ─── Token version check ────────────────────────────────────────────────
    // If the DB tokenVersion was incremented (e.g. admin blocked user),
    // the JWT's tokenVersion will be stale and authentication is rejected.
    if (decoded.tokenVersion !== user.tokenVersion) {
      res.clearCookie("token", { path: "/" });
      sendError(res, 401, "Token revoked — please sign in again");
      return;
    }

    (req as AuthenticatedRequest).userId = user._id.toString();
    next();
  } catch (error) {
    logger.error("Auth middleware error", error);
    res.clearCookie("token", { path: "/" });
    sendError(res, 401, "Invalid or expired token");
  }
}