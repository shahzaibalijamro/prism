import express from "express";
import config, { redis } from "./config/config.js";
import type {
  Request,
  Response,
} from "express";
import { generateRedisKey } from "./utils/generate-redis-key.js";
import { createServer } from "node:http";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import logger from "./config/logger.js";
import { errorHandler } from "./utils/error-handler.js";
import { connectDB } from "./config/db.js";
import { createAnalysisController } from "./controllers/analysis.controller.js";

const app = express();
app.use(
  cors({
    origin: "http://localhost:3000",
  }),
);
app.use(helmet());
app.use(express.json());

const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

app.use((req, _res, next) => {
  logger.http(`${req.method} ${req.url}`);
  next();
});

app.get("/", (_req: Request, res: Response) => {
  return res.json({
    message: "Hello world!",
  });
});

// After creating `io`:
const analyzeHandler = createAnalysisController(io);
app.post("/api/analyze", analyzeHandler);


//just for testing
app.get("/photos", async (req: Request, res: Response) => {
  const key = generateRedisKey(req);
  try {
    // This will check for cache
    const cached: string | null = await redis.get(key);

    // if it's found send the cache
    if (cached) {
      console.log("Cache hit");
      return res.status(200).json(cached);
    }

    // otherwise make the api request
    const request = await fetch("https://jsonplaceholder.typicode.com/photos");
    const photos = await request.json();

    // set it in redis
    await redis.set(key, photos);

    return res.status(200).json(photos);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({
      message: "Something went wrong!",
    });
  }
});

io.on("connection", (socket) => {
  socket.on("message", (message: string) => {
    logger.info("Message from frontend: " + message);
  });
});

// Error handling middleware
app.use(errorHandler);

server.listen(config.port, () => {
  console.log("Server is running!");
  connectDB().then(() => console.log("MongoDB connected"));
});
