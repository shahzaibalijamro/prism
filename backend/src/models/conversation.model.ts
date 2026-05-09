import mongoose, { Schema, type InferSchemaType } from "mongoose";

const conversationSchema = new Schema({
  conversationId: { type: String, unique: true, required: true },
  summary: { type: String, default: "" },
  updatedAt: { type: Date, default: Date.now },
});


export type Conversation = InferSchemaType<typeof conversationSchema>;
export const ConversationModel = mongoose.model("Conversation", conversationSchema);