import { io, type Socket } from "socket.io-client";

const URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  (process.env.NODE_ENV === "production" ? undefined : "https://prism-t1ko.onrender.com");

let _token: string | null = null;

// Call this before socket.connect() to pass the JWT token in the auth handshake.
// Socket.IO connects directly to the backend (different origin from Vercel), so
// the HttpOnly cookie won't be sent. The token is passed via the auth option.
export function setSocketToken(token: string | null) {
  _token = token;
}

function getSocket(): Socket {
  return io(URL, {
    autoConnect: false,
    withCredentials: true, // send HttpOnly auth cookies with Socket.IO transport requests
    // Use a callback so the token is resolved fresh on each connection attempt
    auth: (cb: (data: { token: string | null }) => void) => cb({ token: _token }),
  });
}

export const socket = getSocket();
