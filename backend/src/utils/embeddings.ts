import { genAI } from "../config/config.js";
import logger from "../config/logger.js";

async function createEmbeddings(sentence: string) {
  try {
    const result = await genAI.models.embedContent({
      model: "models/gemini-embedding-2",
      contents: sentence,
    });
    if (result.embeddings) return result.embeddings[0]?.values;
    return null;
  } catch (error) {
    logger.error(error);
    return null;
  }
}

export { createEmbeddings };
