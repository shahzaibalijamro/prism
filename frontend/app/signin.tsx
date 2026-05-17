"use client";

import { useState } from "react";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { useAuth } from "./auth-context";
import { ThemeToggle } from "./theme-toggle";

export function SignInPage() {
  const { signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  async function handleSuccess(credentialResponse: CredentialResponse) {
    if (!credentialResponse.credential) {
      setError("No credential received from Google");
      return;
    }

    setIsSigningIn(true);
    setError(null);
    try {
      await signIn(credentialResponse.credential);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setIsSigningIn(false);
    }
  }

  function handleError() {
    setError("Google Sign-In was cancelled or failed");
  }

  return (
    <div className="signin-page">
      <ThemeToggle />
      <div className="signin-card">
        <div>
          <div className="prism-mark" aria-hidden="true">
            <span />
          </div>
          <h1>PRISM</h1>
          <p className="signin-tagline">Multi-agent perspective engine</p>
          <p className="signin-subtitle">
            Sign in with Google to start analyzing ideas from multiple angles
          </p>

          {error && <div className="signin-error">{error}</div>}

          <div className="signin-button-container">
            {isSigningIn ? (
              <div className="signin-loading">
                <div className="signin-spinner" />
                <span>Signing in...</span>
              </div>
            ) : (
              <GoogleLogin
                onSuccess={handleSuccess}
                onError={handleError}
                useOneTap
                theme="filled_blue"
                size="large"
                text="signin_with"
                width="300"
              />
            )}
          </div>

          <p className="signin-hint">
            Your Google account is used solely for authentication. Chat history
            is tied to your account and stored securely.
          </p>
        </div>
      </div>
    </div>
  );
}
