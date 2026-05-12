import { genAI } from "../config/config.js";
import logger from "../config/logger.js";
import { ConversationModel } from "../models/conversation.model.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function updateConversationSummary(
  conversationId: string,
  userMsg: string,
  assistantMsg: string,
): Promise<string> {
  const conversation = await ConversationModel.findOne({ conversationId });
  const previousSummary = conversation?.summary || "(none)";

  const prompt = `
Current summary:
${previousSummary}

New exchange:
User: ${userMsg}
Assistant: ${assistantMsg}

Please provide the updated summary.`;

  const SYSTEM_INSTRUCTIONS = `You are a conversation summarizer for an AI debate assistant called the Devil's Advocate.

You will receive:
- A running summary of the conversation so far
- The latest exchange between a human user and the Devil's Advocate AI

Your job is to produce an updated summary that incorporates the new exchange into the existing one.

Rules:
- Write between 150 and 250 words — never less than 150, never more than 250
- Write in chronological order — earlier topics come first, recent ones last
- Preserve the full substance of the previous summary — do not gut it to make room for the new exchange; compress individual points if needed, but none should disappear entirely
- Clearly distinguish what the USER proposed or asked from what the DEVIL'S ADVOCATE argued or warned
- Preserve specific details: names, numbers, risks, proposals, and conclusions reached
- Write in a single, dense paragraph of plain prose
- Do NOT use bullet points, headers, or lists
- Do NOT use prefixes like "Summary:" or wrap text in brackets
- Always end on a complete sentence — never cut off mid-thought`;

  const MAX_RETRIES = 5;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTIONS,
          temperature: 0.3,
          maxOutputTokens: 1024,
          thinkingConfig: {
            thinkingBudget: 0, // disables thinking entirely
          },
        },
      });

      logger.debug(
        `Full Gemini response, ${JSON.stringify(response, null, 2)}`,
      );

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const newSummary =
        parts.map((p) => p.text ?? "").join("") || previousSummary;

      await ConversationModel.updateOne(
        { conversationId },
        { summary: newSummary, updatedAt: new Date() },
        { upsert: true },
      );

      logger.debug(`Newly generated summary : ${newSummary}`);

      return newSummary;
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === MAX_RETRIES - 1;
      if (isLastAttempt) break;

      const delay = 2000 * 2 ** attempt; // 1s, 2s, 4s, 8s, 16s
      console.warn(
        `Summary update failed (attempt ${attempt + 1}/${MAX_RETRIES}). Retrying in ${delay / 1000}s...`,
      );
      await sleep(delay);
    }
  }

  console.error(
    "Failed to update conversation summary after all retries:",
    lastError,
  );
  throw lastError;
}

export { updateConversationSummary };
