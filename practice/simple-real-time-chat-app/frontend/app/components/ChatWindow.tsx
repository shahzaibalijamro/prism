// frontend/components/ChatWindow.tsx
"use client";
import { useState, useEffect, useRef } from "react";

const ROOMS = ["general", "tech-talk", "random"];

// ── Types ────────────────────────────────────────────────
interface Message {
  id: string;
  system?: boolean;
  text: string;
  timestamp: string;
  username?: string;
}

interface ChatWindowProps {
  currentRoom: string;
  messages: Message[];
  roomUsers: string[];
  typingUsers: string[];
  onSendMessage: (room: string, text: string) => void;
  onSwitchRoom: (from: string, to: string) => void;
  onStartTyping: (room: string) => void;
  onStopTyping: (room: string) => void;
  isConnected: boolean;
}

export function ChatWindow({
  currentRoom,
  messages,
  roomUsers,
  typingUsers,
  onSendMessage,
  onSwitchRoom,
  onStartTyping,
  onStopTyping,
  isConnected,
}: ChatWindowProps) {
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    onSendMessage(currentRoom, inputText);
    setInputText("");
    onStopTyping(currentRoom);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    if (e.target.value.trim()) {
      onStartTyping(currentRoom);
    } else {
      onStopTyping(currentRoom);
    }
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "sans-serif" }}>
      {/* Sidebar */}
      <div style={{ width: 200, background: "#1a1a2e", color: "white", padding: 16 }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>STATUS</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: isConnected ? "#22c55e" : "#ef4444",
              }}
            />
            <span style={{ fontSize: 12 }}>
              {isConnected ? "Connected" : "Disconnected"}
            </span>
          </div>
        </div>

        {/* Room list */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>ROOMS</div>
          {ROOMS.map((room) => (
            <div
              key={room}
              onClick={() => room !== currentRoom && onSwitchRoom(currentRoom, room)}
              style={{
                padding: "6px 8px",
                borderRadius: 4,
                cursor: room !== currentRoom ? "pointer" : "default",
                background:
                  room === currentRoom ? "rgba(255,255,255,0.15)" : "transparent",
                marginBottom: 2,
                fontSize: 14,
              }}
            >
              # {room}
            </div>
          ))}
        </div>

        {/* Users in room */}
        <div>
          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>
            ONLINE — {roomUsers.length}
          </div>
          {roomUsers.map((user, i) => (
            <div key={i} style={{ fontSize: 13, padding: "3px 0", opacity: 0.85 }}>
              ● {user}
            </div>
          ))}
        </div>
      </div>

      {/* Main chat area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div
          style={{
            padding: "12px 20px",
            borderBottom: "1px solid #eee",
            fontWeight: 600,
            fontSize: 16,
          }}
        >
          # {currentRoom}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {messages.map((msg) =>
            msg.system ? (
              <div
                key={msg.id}
                style={{
                  textAlign: "center",
                  color: "#888",
                  fontSize: 12,
                  margin: "8px 0",
                  fontStyle: "italic",
                }}
              >
                {msg.text}
              </div>
            ) : (
              <div key={msg.id} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>{msg.username}</span>
                  <span style={{ fontSize: 11, color: "#888" }}>
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
                <div style={{ marginTop: 2 }}>{msg.text}</div>
              </div>
            )
          )}

          {typingUsers.length > 0 && (
            <div style={{ fontSize: 12, color: "#888", fontStyle: "italic" }}>
              {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid #eee",
            display: "flex",
            gap: 8,
          }}
        >
          <input
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={`Message #${currentRoom}`}
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: 6,
              border: "1px solid #ddd",
              fontSize: 14,
              outline: "none",
            }}
          />
          <button
            onClick={handleSend}
            style={{
              padding: "10px 20px",
              background: "#0070f3",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}