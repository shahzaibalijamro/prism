import { genAI } from "../config/config.js";
import { ConversationModel } from "../models/conversation.model.js";

async function updateConversationSummary(
  conversationId: string,
  userMsg: string,
  assistantMsg: string
): Promise<string> {
  try {
    // 1. Fetch the existing conversation summary
    const conversation = await ConversationModel.findOne({ conversationId });
    const previousSummary = conversation?.summary || "(none)";

    // 2. Construct the single-turn prompt containing the data
    const prompt = `
Current summary:
${previousSummary}

New exchange:
User: ${userMsg}
Assistant: ${assistantMsg}

Please provide the updated summary.`;

    // 3. Call generateContent (Single-turn generation is best for summarization)
    // Note: Syntax might vary slightly depending on if you are using the older 
    // '@google/generative-ai' SDK or the newer '@google/genai' SDK.
    // The below follows standard generation practices.
    const response = await genAI.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
      config: {
        // Separate the persona from the data for better adherence
        systemInstruction: "You are an expert summarizer. Given the current conversation summary and a new exchange, produce an updated, concise summary that captures all important points, claims, risks, and decisions. Output ONLY the raw summary text in a single paragraph. Do NOT wrap the text in brackets, and do NOT use prefixes like 'Summary:'.",
        temperature: 0.3,
        maxOutputTokens: 500,
      }
    });

    // 4. Extract the text safely
    const newSummary = response.text || previousSummary;

    // 5. Save the updated summary to the database
    await ConversationModel.updateOne(
      { conversationId },
      { summary: newSummary, updatedAt: new Date() },
      { upsert: true }
    );

    return newSummary;
    
  } catch (error) {
    console.error("Failed to update conversation summary:", error);
    // Return previous summary or throw depending on your error handling preference
    throw error; 
  }
}

export { updateConversationSummary };