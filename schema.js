import mongoose from "mongoose";

const SentenceSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
  },

  embedding: {
    type: [Number],
    required: true,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },

  category: {
    type: String,
    default: "general",
  },
}, {
    timestamps: true,
});

export default mongoose.model("Sentence", SentenceSchema);