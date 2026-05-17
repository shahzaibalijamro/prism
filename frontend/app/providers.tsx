"use client";

import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider } from "./auth-context";
import { DarkModeProvider } from "./dark-mode-context";

const clientId =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "dummy_google_client_id";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GoogleOAuthProvider clientId={clientId}>
      <DarkModeProvider>
        <AuthProvider>{children}</AuthProvider>
      </DarkModeProvider>
    </GoogleOAuthProvider>
  );
}