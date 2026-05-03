import express from "express";
import config from "./config/config.js";
import { Redis } from "@upstash/redis";
import type { Response, Request } from "express";
import { generateRedisKey } from "./utils/generate-redis-key.js";
import { createServer } from "node:http";
import { Server } from "socket.io";

const app = express();
const server = createServer(app);
const redis = Redis.fromEnv();
const io = new Server(server);

app.get("/", (req: Request, res: Response) => {
  res.json({
    message: "Hello world!",
  });
});

app.get("/photos", async (req: Request, res: Response) => {
  const key = generateRedisKey(req);
  try {
    // This will check for cache
    const cached: string | null = await redis.get(key);

    // if it's found send the cache
    if (cached) {
      console.log("Cache hit");
      return res.status(200).json(JSON.parse(cached));
    }

    // otherwise make the api request
    const request = await fetch("https://jsonplaceholder.typicode.com/photos");
    const photos = await request.json();

    // set it in redis
    await redis.set(key, JSON.stringify(photos));

    // send it back
    res.status(200).json(photos);
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Something went wrong!",
    });
  }
});

io.on('connection', (socket) => {
  console.log('a user connected');
});

server.listen(config.port, () => {
  console.log("Server is running!");
});
