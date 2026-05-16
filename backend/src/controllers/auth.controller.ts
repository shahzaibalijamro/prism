import type { Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import config from "../config/config.js";
import { UserModel } from "../models/user.model.js";
import jwt from "jsonwebtoken";
import { sendError, sendSuccess } from "../utils/response-handler.js";
import logger from "../config/logger.js";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";

const googleClient = new OAuth2Client({
  clientId: config.googleClientId,
  clientSecret: config.googleClientSecret,
});

// ─── Google Sign-In callback ─────────────────────────────────────────────────
// Frontend sends the Google ID token in the "credential" field.
// We verify it with Google, then extract the user profile.
// If new user → create in DB; if existing → update profile fields.
// Generate JWT with userId + tokenVersion and set HttpOnly cookie.
export async function googleSignIn(req: Request, res: Response) {
  const { credential } = req.body;
  if (!credential) {
    return sendError(res, 400, "Google credential is required");
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: config.googleClientId,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return sendError(res, 401, "Invalid Google token");
    }

    const { sub: googleId, email, name, picture } = payload;
    if (!googleId || !email) {
      return sendError(res, 400, "Google token missing required fields");
    }

    // Upsert user in MongoDB — schema defaults apply on insert (tokenVersion: 0)
    const user = await UserModel.findOneAndUpdate(
      { googleId },
      {
        email,
        name,
        avatarUrl: picture ?? "",
      },
      { upsert: true, returnDocument: "after" },
    );

    const token = jwt.sign(
      { userId: user._id.toString(), tokenVersion: user.tokenVersion },
      config.jwtSecret,
      {
        // This conditionally adds the property only if it's not undefined
        ...(config.jwtExpiresIn !== undefined && {
          expiresIn: config.jwtExpiresIn,
        }),
      },
    );

    // Set HttpOnly cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: config.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: config.jwtCookieMaxAge, // milliseconds
      path: "/",
    });

    return sendSuccess(
      res,
      200,
      {
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
        },
      },
      "Signed in successfully",
    );
  } catch (error) {
    logger.error("Google Sign-In failed", error);
    return sendError(res, 500, "Authentication failed");
  }
}

// ─── Get current user profile ────────────────────────────────────────────────
export async function getProfile(req: Request, res: Response) {
  try {
    const user = await UserModel.findById(
      (req as unknown as AuthenticatedRequest).userId,
    );
    if (!user) {
      return sendError(res, 404, "User not found");
    }

    return sendSuccess(res, 200, {
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (error) {
    logger.error("Failed to fetch profile", error);
    return sendError(res, 500, "Failed to fetch profile");
  }
}

// ─── Sign out ────────────────────────────────────────────────────────────────
// Clears the HttpOnly cookie. Optionally increments tokenVersion in DB
// to fully invalidate any potentially leaked tokens.
export async function signOut(req: Request, res: Response) {
  try {
    // Increment tokenVersion so any stale JWTs are rejected by authMiddleware
    await UserModel.findByIdAndUpdate(
      (req as unknown as AuthenticatedRequest).userId,
      {
        $inc: { tokenVersion: 1 },
      },
    );

    res.clearCookie("token", { path: "/" });
    return sendSuccess(res, 200, null, "Signed out successfully");
  } catch (error) {
    logger.error("Sign-out failed", error);
    return sendError(res, 500, "Sign-out failed");
  }
}
