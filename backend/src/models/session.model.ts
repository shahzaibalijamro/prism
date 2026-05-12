// src/models/session.model.ts
import mongoose, { Schema, type InferSchemaType } from "mongoose";

const agentOutputSchema = new Schema(
  {
    agentName: { type: String, required: true },
    content: { type: String, required: true },
    latencyMs: { type: Number, required: true },
  },
  { _id: false },
);

const sessionSchema = new Schema({
  sessionId: { type: String, unique: true, required: true, index: true },

  query: { type: String, required: true },

  round1: { type: [agentOutputSchema], default: [] },
  round2: { type: [agentOutputSchema], default: [] },

  synthesis: { type: String, default: "" },

  // "running" during orchestration, "complete" when done, "failed" on error
  status: {
    type: String,
    enum: ["running", "complete", "failed"],
    default: "running",
  },

  // Stored so we can do session-level vector search later
  // (find past sessions similar to a new query)
  embedding: { type: [Number], default: [] },
});

export type Session = InferSchemaType<typeof sessionSchema>;
export const SessionModel = mongoose.model("Session", sessionSchema);