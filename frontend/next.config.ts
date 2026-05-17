import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ─── API rewrites ──────────────────────────────────────────────────────────
  // Proxy all /api/* requests to the backend server so that HttpOnly cookies
  // are set on the same origin (localhost:3000) as the frontend. Without this
  // rewrite, cross-origin fetch to localhost:9000 would set cookies on a
  // different port, causing SameSite / CORS complications.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "https://prism-t1ko.onrender.com/api/:path*",
      },
    ];
  },
};

export default nextConfig;
