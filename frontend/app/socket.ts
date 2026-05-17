import { io } from "socket.io-client";

const URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  (process.env.NODE_ENV === "production" ? undefined : "https://prism-t1ko.onrender.com");

export const socket = io(URL, {
  autoConnect: false,
  withCredentials: true, // send HttpOnly auth cookies with Socket.IO transport requests
});
