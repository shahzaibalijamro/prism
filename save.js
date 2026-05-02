import dotenv from "dotenv";
dotenv.config();
import mongoose, { mongo } from "mongoose";
import { GoogleGenAI } from "@google/genai";
import Schema from "./schema.js";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const rl = readline.createInterface({ input, output });

const embedText = async (text) => {
  const result = await ai.models.embedContent({
    model: "models/gemini-embedding-2",
    contents: text,
  });
  return result.embeddings[0].values;
};

const saveSentence = async (sentence, category = "general") => {

  const embeddings = await embedText(sentence);

  const document = await Schema.create({
    text: sentence,
    embedding: embeddings,
    category,
  });

  console.log(`  ✓ Saved to MongoDB (ID: ${document._id})`);
  console.log(`  ✓ Embedding dimensions: ${embeddings.length}`);
  console.log(
    `  ✓ First 5 values: [${embeddings
      .slice(0, 5)
      .map((n) => n.toFixed(4))
      .join(", ")}...]`,
  );

  return document;
};

const main = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB Atlas");

  const sentences = [
    // Career / anxiety
    { text: "I am terrified of losing my job", category: "anxiety" },
    { text: "I am scared about being unemployed", category: "anxiety" },
    { text: "My company might lay me off soon", category: "career" },

    { text: "I feel genuinely happy today", category: "happiness" },
    {
      text: "Life is going really well for me right now",
      category: "happiness",
    },
    {
      text: "I am in a great mood and everything is wonderful",
      category: "happiness",
    },

    { text: "I love eating spicy biryani on weekends", category: "food" },
    { text: "The best breakfast is fresh paratha with chai", category: "food" },

    { text: "Node.js is perfect for building backend APIs", category: "tech" },
    { text: "MongoDB is a great database for flexible data", category: "tech" },
    {
      text: "JavaScript is the most widely used programming language",
      category: "tech",
    },
  ];

  for (const item of sentences) {
    await saveSentence(item.text, item.category);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log("\n──────────────────────────────────────────");
  console.log("All sentences saved! Now open MongoDB Compass and");
  console.log("connect to your cluster to see the documents.");
  console.log('Look at the "embedding" field — it is an array of 768 numbers.');
  console.log("──────────────────────────────────────────\n");

  await mongoose.disconnect();
};

main();