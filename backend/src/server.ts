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
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import logger from "./config/logger.js";
import { errorHandler } from "./utils/error-handler.js";
import { connectDB } from "./config/db.js";
import { createAnalysisController } from "./controllers/analysis.controller.js";
import authRoutes from "./routes/auth.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import { authMiddleware } from "./middleware/auth.middleware.js";
import { UserModel } from "./models/user.model.js";

const app = express();

// CORS must be configured before other middleware so that preflight requests work
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true, // required for HttpOnly cookies to be sent/received
  }),
);

app.use(helmet());
app.use(express.json());
app.use(cookieParser()); // parse HttpOnly cookies from incoming requests

const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true, // required when client sends cookies (withCredentials: true)
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

// ─── Auth routes (Google Sign-In, profile, sign-out) ────────────────────────
app.use("/api/auth", authRoutes);

// ─── Chat routes (fetch user chats, chat detail, delete chat) ───────────────
app.use("/api/chats", chatRoutes);

// ─── Analysis route (requires authentication) ──────────────────────────────
const analyzeHandler = createAnalysisController(io);
app.post("/api/analyze", authMiddleware, analyzeHandler);

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

// ─── Socket.IO authentication middleware ────────────────────────────────────
// Verifies the JWT from the HttpOnly cookie on socket connections.
// Rejects connections that aren't authenticated or have a token version mismatch.
io.use(async (socket, next) => {
  try {
    const cookieHeader = socket.handshake.headers.cookie;
    if (!cookieHeader) {
      return next(new Error("Authentication required"));
    }

    // Parse cookies to find the JWT token
    const tokenCookie = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("token="));

    if (!tokenCookie) {
      return next(new Error("Authentication required"));
    }

    const token = tokenCookie.split("=")[1];
    if (!token) {
      return next(new Error("Authentication required"));
    }

    // Verify JWT and compare token version with the user's MongoDB document
    const decoded = jwt.verify(token, config.jwtSecret as jwt.Secret) as {
      userId: string;
      tokenVersion: number;
    };

    const user = await UserModel.findById(decoded.userId);
    if (!user || decoded.tokenVersion !== user.tokenVersion) {
      return next(new Error("Token version mismatch — please re-authenticate"));
    }

    // Attach userId to socket data for use in handlers
    socket.data.userId = decoded.userId;
    next();
  } catch {
    next(new Error("Authentication failed"));
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
