// frontend/hooks/useSocket.ts
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

export const serverURL = process.env.NEXT_PUBLIC_SERVER_URL as string;

// ── Shared types ──────────────────────────────────
interface Message {
  id: string;
  system?: boolean;
  text: string;
  timestamp: string;
  username?: string;
}

interface JoinConfirmed {
  room: string;
  users: string[];
}

interface UserJoinLeft {
  username: string;
  users: string[];
}

interface TypingUpdate {
  username: string;
  isTyping: boolean;
}

export interface UseSocketReturn {
  isConnected: boolean;
  hasJoined: boolean;
  messages: Message[];
  roomUsers: string[];
  typingUsers: string[];
  currentRoom: string;
  joinRoom: (username: string, room: string) => void;
  sendMessage: (room: string, text: string) => void;
  switchRoom: (from: string, to: string) => void;
  startTyping: (room: string) => void;
  stopTyping: (room: string) => void;
  socketId: string | undefined;
}

export function useSocket(): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [roomUsers, setRoomUsers] = useState<string[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [hasJoined, setHasJoined] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<string>("");
  const [socketId, setSocketId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const socket = io(serverURL, {
      autoConnect: true,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Connected to server. Socket ID:", socket.id);
      setIsConnected(true);
      setSocketId(socket.id);
    });

    socket.on("disconnect", (reason: string) => {
      console.log("Disconnected:", reason);
      setIsConnected(false);
      setHasJoined(false);
      setCurrentRoom("");
      setSocketId(undefined);
    });

    socket.on("connect_error", (error: Error) => {
      console.error("Connection error:", error.message);
      setIsConnected(false);
    });

    socket.on("user:join_confirmed", ({ room, users }: JoinConfirmed) => {
      setCurrentRoom(room);
      setRoomUsers(users);
      setHasJoined(true);
      setMessages([]);
    });

    socket.on("message:received", (message: Message) => {
      setMessages((prev) => [...prev, message]);
    });

    socket.on("room:user_joined", ({ username, users }: UserJoinLeft) => {
      setRoomUsers(users);
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          system: true,
          text: `${username} joined the room`,
          timestamp: new Date().toISOString(),
        },
      ]);
    });

    socket.on("room:user_left", ({ username, users }: UserJoinLeft) => {
      setRoomUsers(users);
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          system: true,
          text: `${username} left the room`,
          timestamp: new Date().toISOString(),
        },
      ]);
    });

    socket.on("typing:update", ({ username, isTyping }: TypingUpdate) => {
      setTypingUsers((prev) =>
        isTyping
          ? [...new Set([...prev, username])]
          : prev.filter((u) => u !== username)
      );
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const joinRoom = useCallback((username: string, room: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit("user:join", { username, room });
  }, []);

  const sendMessage = useCallback((room: string, text: string) => {
    if (!socketRef.current || !text.trim()) return;
    socketRef.current.emit("message:send", { room, text });
  }, []);

  const switchRoom = useCallback((from: string, to: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit("room:switch", { from, to, id: socketRef.current?.id });
    setMessages([]);
  }, []);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startTyping = useCallback((room: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit("typing:start", { room });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit("typing:stop", { room });
    }, 2000);
  }, []);

  const stopTyping = useCallback((room: string) => {
    if (!socketRef.current) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socketRef.current.emit("typing:stop", { room });
  }, []);

  return {
    isConnected,
    hasJoined,
    messages,
    roomUsers,
    typingUsers,
    currentRoom,
    joinRoom,
    sendMessage,
    switchRoom,
    startTyping,
    stopTyping,
    socketId,
  };
}
