import { genAI } from "../config/config.js";
import logger from "../config/logger.js";

// Simple sleep helper (you can also import it from a shared utility)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function createEmbeddings(sentence: string) {
  const MAX_RETRIES = 5;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await genAI.models.embedContent({
        model: "models/gemini-embedding-2",
        contents: sentence,
      });

      if (result.embeddings && result.embeddings[0]?.values) {
        return result.embeddings[0].values;
      }

      // If embeddings exist but are empty, treat as a soft failure
      throw new Error("Empty embedding values");
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === MAX_RETRIES - 1;
      if (isLastAttempt) break;

      const delay = 2000 * 2 ** attempt; // 2s, 4s, 8s, 16s
      console.warn(
        `Embedding generation failed (attempt ${attempt + 1}/${MAX_RETRIES}). Retrying in ${delay / 1000}s...`
      );
      await sleep(delay);
    }
  }

  logger.error("Failed to generate embeddings after all retries:", lastError);
  throw lastError;
}

export { createEmbeddings };