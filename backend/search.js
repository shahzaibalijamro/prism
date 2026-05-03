import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import schema from "./schema.js";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const rl = readline.createInterface({ input, output });

async function embedSearchText(text) {
  const result = await ai.models.embedContent({
    contents: text,
    model: "models/gemini-embedding-2",
  });
  return result.embeddings[0].values;
}

async function searchRelatedSentences(sentence) {
  const embeddings = await embedSearchText(sentence);

  const results = await schema.aggregate([
    {
      $vectorSearch: {
        index: "default",
        path: "embedding",
        limit: 5,
        numCandidates: 50,
        queryVector: embeddings,
      },
    },
    {
      $project: {
        text: 1,
        category: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
  ]);

  console.log(results);

  if (results.length === 0) {
    return console.log("No related sentences found!");
  }

  results.forEach((result, index) => {
    const scorePercent = (result.score * 100).toFixed(1);
    const bar = "█".repeat(Math.round(result.score * 20)); // visual bar
    console.log(`\n${index + 1}. [${scorePercent}%] ${bar}`);
    console.log(`   Category: ${result.category}`);
    console.log(`   Text: "${result.text}"`);
  });

  return results;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("MONGO DB CONNECTED");
  while (true) {
    const sentence = await rl.question("Enter a sentence or 'q' to quit: ");
    if (sentence === "q") break;
    await searchRelatedSentences(sentence);
  }
  await mongoose.disconnect();
  rl.close();
}

main();