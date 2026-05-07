import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import cors from "cors";
import type { Request, Response } from "express";
import {
  getRoomNames,
  getUserNameBySocketId,
  getUsersInARoom,
  joinRoom,
  leaveRoom,
  removeFromAllRooms,
} from "./roomManager.js";

const app = express();
app.use(
  cors({
    origin: "http://localhost:3000",
  }),
);
app.use(express.json());
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
  },
});
const port: number = Number(process.env.PORT);

app.get("/rooms", (req: Request, res: Response) => {
  res.status(200).json({
    rooms: getRoomNames(),
  });
});

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.onAny((eventName, ...args) => {
    console.log(eventName, args);
  });

  socket.onAnyOutgoing((event, ...args) => {
    console.log("Sending:", event, args);
  });

  socket.on("user:join", (data: { username: string; room: string }) => {
    joinRoom(data.username, socket.id, data.room.toLowerCase());

    socket.join(data.room);

    socket.data.username = data.username;
    socket.data.room = data.room;
    const users = getUsersInARoom(data.room);

    socket.to(data.room).emit("room:user_joined", {
      username: data.username,
      users,
      room: data.room,
    });

    socket.emit("user:join_confirmed", {
      users,
      room: data.room,
    });
  });

  socket.on("message:send", (data: { room: string; text: string }) => {
    if (!data.text || data.text === "" || data.text.trim() === "") return;
    io.to(data.room).emit("message:received", {
      text: data.text.trim(),
      username:
        socket.data.username || getUserNameBySocketId(socket.id, data.room),
      timestamp: new Date().toISOString(),
      id: `${Date.now()}-${socket.id}`,
    });
  });

  socket.on("typing:start", (data: { room: string }) => {
    socket.to(data.room).emit("typing:update", {
      username: getUserNameBySocketId(socket.id, data.room),
      isTyping: true,
    });
  });

  socket.on("typing:stop", (data: { room: string }) => {
    socket.to(data.room).emit("typing:update", {
      username: getUserNameBySocketId(socket.id, data.room),
      isTyping: false,
    });
  });

  socket.on("room:switch", (data: { from: string; to: string }) => {
    const username =
      socket.data.username || getUserNameBySocketId(socket.id, data.from);
    leaveRoom(socket.id, data.from);
    socket.leave(data.from);
    socket.to(data.from).emit("room:user_left", {
      username,
      users: getUsersInARoom(data.from),
    });
    joinRoom(username, socket.id, data.to.toLowerCase());
    socket.join(data.to);
    socket.to(data.to).emit("room:user_joined", {
      username,
      users: getUsersInARoom(data.to),
      room: data.to,
    });
    socket.emit("user:join_confirmed", {
      users: getUsersInARoom(data.to),
      room: data.to,
    });
  });

  socket.on("disconnect", () => {
    removeFromAllRooms(socket.id);
    const room = socket.data.room;
    socket.leave(room);
    socket.to(room).emit("room:user_left", {
      username:
        socket.data.username || getUserNameBySocketId(socket.id, room),
      users: getUsersInARoom(room),
    });
  });
});

httpServer.listen(port, () => {
  console.log("Port is running on ", port);
});
