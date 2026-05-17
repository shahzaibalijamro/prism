"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

type UserProfile = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
};

type AuthContextValue = {
  user: UserProfile | null;
  loading: boolean;
  accessToken: string | null;
  signIn: (credential: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ─── Check if already authenticated on mount ──────────────────────────────
  // Calls /api/auth/profile with credentials (HttpOnly cookie) to see if
  // the user has a valid session. If so, populate user state immediately.
  // The profile endpoint now also returns a fresh JWT token so the frontend
  // can pass it to Socket.IO for cross-origin authentication.
  useEffect(() => {
    fetch("/api/auth/profile", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data?.user) {
          setUser(data.data.user);
          if (data.data.token) {
            setAccessToken(data.data.token);
          }
        }
      })
      .catch(() => {
        // Not authenticated — leave user as null
      })
      .finally(() => setLoading(false));
  }, []);

  // ─── Sign in with Google credential ──────────────────────────────────────
  // Receives the Google ID token (credential) from the frontend GoogleLogin
  // component, sends it to the backend, which verifies it, upserts the user
  // in MongoDB, sets an HttpOnly JWT cookie, and returns the user profile.
  // The response body also includes the JWT token so the frontend can pass it
  // to Socket.IO via auth handshake (needed because Socket.IO connects directly
  // to the backend on a different origin, so the HttpOnly cookie won't be sent).
  const signIn = useCallback(async (credential: string) => {
    const res = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
      credentials: "include",
    });

    const data = await res.json();
    if (data.success && data.data?.user) {
      setUser(data.data.user);
      // Store the JWT token from the response body for Socket.IO auth
      if (data.data.token) {
        setAccessToken(data.data.token);
      }
    } else {
      throw new Error(data.message || "Sign-in failed");
    }
  }, []);

  // ─── Sign out ────────────────────────────────────────────────────────────
  // Calls the backend signout endpoint which clears the HttpOnly cookie and
  // increments the user's tokenVersion in MongoDB (invalidating any stale JWTs).
  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/signout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Even if the request fails, clear local state
    }
    setUser(null);
    setAccessToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, accessToken, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}