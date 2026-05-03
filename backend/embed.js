import dotenv from "dotenv";
dotenv.config();

import { GoogleGenAI } from "@google/genai";

const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

async function embedSentence(text) {
  const result = await genAI.models.embedContent({
    model: "models/gemini-embedding-2",
    contents: text,
  });

  return result.embeddings[0].values;
}

async function main() {
  const sentence = "I am worried about losing my job";

  console.log(`\nConverting to embedding: "${sentence}"\n`);

  const vector = await embedSentence(sentence);

  console.log(`Number of dimensions: ${vector.length}`);

  console.log(`\nFirst 10 values (out of 768):`);
  console.log(vector.slice(0, 10));

  console.log(`\nFull vector would be too long to display.`);
  console.log(`But every sentence gets exactly 768 numbers — always.`);
}

main();
