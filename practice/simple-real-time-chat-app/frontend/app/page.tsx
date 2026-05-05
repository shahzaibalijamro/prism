// frontend/app/page.jsx
"use client";
import { useState } from "react";
import { useSocket } from "./hooks/useSocket";
import { JoinScreen } from "./components/JoinScreen";
import { ChatWindow } from "./components/ChatWindow";

export default function Home() {
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);

  const {
    isConnected,
    hasJoined,
    messages,
    roomUsers,
    typingUsers,
    joinRoom,
    sendMessage,
    switchRoom,
    startTyping,
    stopTyping,
  } = useSocket();

  // Called when the user submits the join form
  const handleJoin = (username: string, room: string) => {
    setCurrentRoom(room);
    joinRoom(username, room);
  };

  // Called when the user switches rooms
  const handleSwitchRoom = (from: string, to: string) => {
    setCurrentRoom(to);
    switchRoom(from, to);
  };

  // Show join screen if the user hasn't joined a room yet
  if (!hasJoined) {
    return <JoinScreen onJoin={handleJoin} />;
  }

  return (
    <ChatWindow
      currentRoom={currentRoom!}
      messages={messages}
      roomUsers={roomUsers}
      typingUsers={typingUsers}
      onSendMessage={sendMessage}
      onSwitchRoom={handleSwitchRoom}
      onStartTyping={startTyping}
      onStopTyping={stopTyping}
      isConnected={isConnected}
    />
  );
}