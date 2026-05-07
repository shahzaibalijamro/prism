// frontend/components/ChatWindow.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

const ROOMS = ["general", "tech-talk", "economists", "politics"];

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

const formatRoomName = (room: string) =>
  room
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const getInitial = (username?: string) =>
  username?.trim().charAt(0).toUpperCase() || "?";

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

  const availableRooms = useMemo(
    () => Array.from(new Set([currentRoom, ...ROOMS])).filter(Boolean),
    [currentRoom],
  );
  const activeTypingUsers = typingUsers.filter(Boolean);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!inputText.trim() || !isConnected) return;

    onSendMessage(currentRoom, inputText);
    setInputText("");
    onStopTyping(currentRoom);
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    if (e.target.value.trim()) {
      onStartTyping(currentRoom);
    } else {
      onStopTyping(currentRoom);
    }
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <main className="min-h-svh bg-[#f6f7fb] text-[#17191f]">
      <div className="mx-auto grid min-h-svh w-full max-w-7xl lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-b border-[#e2e8f0] bg-[#15171d] px-4 py-4 text-white lg:border-b-0 lg:border-r lg:border-[#252a33] lg:px-5 lg:py-6">
          <div className="flex items-center justify-between gap-4 lg:block">
            <div>
              <div className="text-xl font-semibold">Prism Chat</div>
              <div className="mt-1 text-sm text-[#aab2c0]">
                {roomUsers.length} online in #{currentRoom}
              </div>
            </div>
            <div className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-medium text-[#d8dee9] lg:mt-5 lg:w-fit">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  isConnected ? "bg-[#22c55e]" : "bg-[#ef4444]"
                }`}
              />
              {isConnected ? "Connected" : "Offline"}
            </div>
          </div>

          <nav className="mt-5 lg:mt-8">
            <div className="mb-3 text-xs font-semibold uppercase text-[#798294]">
              Rooms
            </div>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              {availableRooms.map((room) => {
                const isCurrent = room === currentRoom;

                return (
                  <button
                    key={room}
                    type="button"
                    onClick={() =>
                      !isCurrent && onSwitchRoom(currentRoom, room)
                    }
                    className={`flex h-11 items-center justify-between rounded-lg px-3 text-left text-sm font-semibold transition ${
                      isCurrent
                        ? "bg-white text-[#17191f] shadow-sm"
                        : "text-[#c7cedb] hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <span className="truncate">#{room}</span>
                    {isCurrent ? (
                      <span className="h-2 w-2 rounded-full bg-[#0f766e]" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </nav>

          <section className="mt-5 lg:mt-8">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase text-[#798294]">
                Online
              </div>
              <div className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-[#d8dee9]">
                {roomUsers.length}
              </div>
            </div>

            <div className="max-h-40 space-y-2 overflow-y-auto pr-1 lg:max-h-[calc(100svh-25rem)]">
              {roomUsers.length > 0 ? (
                roomUsers.map((user, i) => (
                  <div
                    key={`${user}-${i}`}
                    className="flex h-10 items-center gap-3 rounded-lg bg-white/5 px-3"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#14b8a6] text-xs font-bold text-[#052e2b]">
                      {getInitial(user)}
                    </span>
                    <span className="truncate text-sm font-medium text-[#edf2f7]">
                      {user}
                    </span>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-white/15 px-3 py-4 text-sm text-[#aab2c0]">
                  No users yet
                </div>
              )}
            </div>
          </section>
        </aside>

        <section className="flex min-h-[calc(100svh-12rem)] flex-col bg-white lg:min-h-svh">
          <header className="flex min-h-20 items-center justify-between gap-4 border-b border-[#e2e8f0] px-4 py-4 sm:px-6">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase text-[#0f766e]">
                Current room
              </div>
              <h1 className="truncate text-2xl font-semibold text-[#17191f]">
                #{formatRoomName(currentRoom)}
              </h1>
            </div>
            <div className="hidden shrink-0 items-center gap-2 rounded-full border border-[#d0d5dd] bg-[#f8fafc] px-3 py-2 text-sm font-medium text-[#475467] sm:flex">
              <span className="h-2 w-2 rounded-full bg-[#14b8a6]" />
              {roomUsers.length} online
            </div>
          </header>

          <div className="flex-1 overflow-y-auto bg-[#fbfcfe] px-4 py-5 sm:px-6">
            {messages.length === 0 ? (
              <div className="flex min-h-[52vh] items-center justify-center">
                <div className="w-full max-w-sm rounded-lg border border-dashed border-[#cbd5e1] bg-white p-6 text-center shadow-sm">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#ecfdf5] text-sm font-bold text-[#0f766e]">
                    #
                  </div>
                  <h2 className="mt-4 text-lg font-semibold text-[#17191f]">
                    Start #{formatRoomName(currentRoom)}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[#667085]">
                    Messages sent here will appear for everyone in this room.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) =>
                  msg.system ? (
                    <div key={msg.id} className="flex justify-center">
                      <div className="rounded-full border border-[#e2e8f0] bg-white px-3 py-1 text-xs font-medium text-[#667085] shadow-sm">
                        {msg.text}
                      </div>
                    </div>
                  ) : (
                    <article
                      key={msg.id}
                      className="group flex items-start gap-3 rounded-lg px-1 py-1"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#111827] text-sm font-bold text-white">
                        {getInitial(msg.username)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className="font-semibold text-[#23262f]">
                            {msg.username || "Guest"}
                          </span>
                          <time className="text-xs font-medium text-[#98a2b3]">
                            {formatTime(msg.timestamp)}
                          </time>
                        </div>
                        <div className="mt-1 inline-block max-w-full rounded-lg rounded-tl-sm border border-[#e2e8f0] bg-white px-4 py-2.5 text-[15px] leading-6 text-[#344054] shadow-sm">
                          {msg.text}
                        </div>
                      </div>
                    </article>
                  ),
                )}
              </div>
            )}

            {activeTypingUsers.length > 0 ? (
              <div className="mt-4 flex items-center gap-2 text-sm font-medium text-[#667085]">
                <span className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#98a2b3]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#98a2b3] [animation-delay:120ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#98a2b3] [animation-delay:240ms]" />
                </span>
                {activeTypingUsers.join(", ")}{" "}
                {activeTypingUsers.length === 1 ? "is" : "are"} typing
              </div>
            ) : null}

            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={handleSend}
            className="border-t border-[#e2e8f0] bg-white px-4 py-4 sm:px-6"
          >
            <div className="flex items-end gap-3 rounded-lg border border-[#d0d5dd] bg-[#f8fafc] p-2 shadow-sm focus-within:border-[#0f766e] focus-within:ring-4 focus-within:ring-[#99f6e4]/40">
              <input
                value={inputText}
                onChange={handleInputChange}
                placeholder={`Message #${currentRoom}`}
                disabled={!isConnected}
                className="min-h-10 flex-1 bg-transparent px-2 text-[15px] text-[#17191f] outline-none placeholder:text-[#98a2b3] disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || !isConnected}
                className="h-10 rounded-lg bg-[#0f766e] px-5 text-sm font-semibold text-white transition hover:bg-[#115e59] disabled:cursor-not-allowed disabled:bg-[#cbd5e1] disabled:text-[#667085]"
              >
                Send
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
