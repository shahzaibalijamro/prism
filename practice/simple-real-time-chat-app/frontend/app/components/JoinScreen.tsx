// frontend/components/JoinScreen.tsx
"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import { serverURL } from "../hooks/useSocket";

const FALLBACK_ROOMS = ["general", "tech-talk", "economists", "politics"];

const formatRoomName = (room: string) =>
  room
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export function JoinScreen({
  onJoin,
}: {
  onJoin: (username: string, room: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("general");
  const [rooms, setRooms] = useState<string[]>(FALLBACK_ROOMS);
  const [loading, setLoading] = useState(true);
  const [roomError, setRoomError] = useState("");

  const handleJoin = () => {
    if (!username.trim()) return;
    onJoin(username.trim(), selectedRoom);
  };

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const { data } = await axios.get<{ rooms: string[] }>(
          `${serverURL}/rooms`,
        );
        if (data.rooms?.length) {
          setRooms(data.rooms);
          setSelectedRoom(data.rooms[0]);
        }
      } catch (error) {
        console.log(error);
        setRoomError("Using default rooms");
      } finally {
        setLoading(false);
      }
    };

    fetchRooms();
  }, []);

  return (
    <main className="min-h-svh bg-[#f6f7fb] px-4 py-6 text-[#17191f] sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100svh-3rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[1fr_440px]">
        <section className="hidden lg:block">
          <div className="max-w-xl">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#dfe4ea] bg-white px-3 py-1 text-sm font-medium text-[#4b5563] shadow-sm">
              <span className="h-2 w-2 rounded-full bg-[#14b8a6]" />
              Live rooms
            </div>
            <h1 className="text-5xl font-semibold tracking-normal text-[#17191f]">
              Prism Chat
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-8 text-[#667085]">
              Clean rooms, quick messages, and the people currently around.
            </p>
            <div className="mt-10 grid max-w-lg grid-cols-2 gap-3">
              {rooms.slice(0, 4).map((room) => (
                <div
                  key={room}
                  className="rounded-lg border border-[#e2e8f0] bg-white p-4 shadow-sm"
                >
                  <div className="text-xs font-semibold uppercase text-[#8a94a6]">
                    Room
                  </div>
                  <div className="mt-2 text-base font-semibold text-[#23262f]">
                    #{room}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-md rounded-lg border border-[#e2e8f0] bg-white p-5 shadow-[0_24px_70px_rgba(21,31,48,0.10)] sm:p-7">
          <div className="mb-8">
            <div className="text-sm font-semibold uppercase text-[#0f766e]">
              Real-time chat
            </div>
            <h2 className="mt-2 text-3xl font-semibold text-[#17191f]">
              Join a room
            </h2>
          </div>

          <div className="space-y-6">
            <label className="block">
              <span className="text-sm font-medium text-[#344054]">
                Username
              </span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                placeholder="Shahzaib"
                className="mt-2 h-12 w-full rounded-lg border border-[#d0d5dd] bg-white px-4 text-base text-[#17191f] outline-none transition focus:border-[#0f766e] focus:ring-4 focus:ring-[#99f6e4]/40"
              />
            </label>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-[#344054]">
                  Room
                </span>
                {roomError ? (
                  <span className="text-xs font-medium text-[#b45309]">
                    {roomError}
                  </span>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {loading
                  ? FALLBACK_ROOMS.map((room) => (
                      <div
                        key={room}
                        className="h-12 animate-pulse rounded-lg bg-[#eef2f6]"
                      />
                    ))
                  : rooms.map((room) => {
                      const isSelected = selectedRoom === room;

                      return (
                        <button
                          key={room}
                          type="button"
                          onClick={() => setSelectedRoom(room)}
                          className={`flex h-12 items-center justify-between rounded-lg border px-3 text-left text-sm font-semibold transition ${
                            isSelected
                              ? "border-[#0f766e] bg-[#ecfdf5] text-[#0f4f49] shadow-sm"
                              : "border-[#d0d5dd] bg-white text-[#475467] hover:border-[#98a2b3] hover:bg-[#f8fafc]"
                          }`}
                        >
                          <span>#{room}</span>
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${
                              isSelected ? "bg-[#0f766e]" : "bg-[#cbd5e1]"
                            }`}
                          />
                        </button>
                      );
                    })}
              </div>
            </div>

            <button
              type="button"
              onClick={handleJoin}
              disabled={!username.trim()}
              className="h-12 w-full rounded-lg bg-[#17191f] px-4 text-sm font-semibold text-white transition hover:bg-[#2a2e38] disabled:cursor-not-allowed disabled:bg-[#d0d5dd] disabled:text-[#667085]"
            >
              Join {formatRoomName(selectedRoom)}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
