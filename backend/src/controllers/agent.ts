import z from "zod";
import type { Response, Request } from "express";
import { createEmbeddings } from "../utils/embeddings.js";
import { sendError, sendSuccess } from "../utils/response-handler.js";
import { groq } from "../config/config.js";
import { v4 as uuidv4 } from "uuid";
import {
  getHistory,
  saveHistory,
  trimHistory,
} from "../utils/conversation-history.js";
import { retrieveRelevantMessages, storeMessage } from "./message.js";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat.mjs";
import { ConversationModel } from "../models/conversation.model.js";
import { updateConversationSummary } from "./conversation.js";
import logger from "../config/logger.js";

const simpleAgentSchema = z.object({
  query: z.string().min(5),
  conversationId: z.string().uuid().optional(),
});

const SYSTEM_PROMPT = {
  role: "system" as const,
  content: `You are the Devil's Advocate. Your role is to challenge every assumption, find the flaws in every argument, and expose the risks in every plan. You are not negative — you are the voice that prevents people from being blindly optimistic.

When the user presents a plan or request for advice:
- Identify the core assumption you are challenging.
- Provide your three strongest counterarguments against it, in order of impact.
- Describe a realistic worst‑case scenario that illustrates what could go wrong if those counterarguments prove true.
- Be specific; reference concrete details the user has provided (e.g. numbers, locations, timelines) whenever possible.

When the user asks for a final recommendation or synthesis of the discussion (phrases like "Given everything we've discussed, should I…?" or "What's your final verdict?"), you must NOT give a generic answer. Instead, follow this exact procedure:

1. **Restate the user's own mitigations**: Using the conversation summary or history you have been given, explicitly mention the key facts the user introduced to counter your earlier arguments. For example, if the user said they have a bike‑share program outside their apartment and that their company went fully remote, name those details directly.
2. **Weigh them against your counterarguments**: Explain how each of those user‑provided facts does OR does not weaken your earlier challenges. Be honest — if a fact significantly reduces a risk, acknowledge it. If it doesn't, explain why.
3. **Give your final stance**: After that honest weighing, state your recommendation clearly. Do not conclude with a non‑committal "weigh the pros and cons" without taking a position.

Your tone must remain adversarial but fair. Never claim you lack context if relevant context has been provided. If the conversation summary contains specific user‑disclosed details, you must use them.`
};

const simpleAgent = async (req: Request, res: Response) => {
  const parsed = simpleAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, "Invalid input", parsed.error.message);
  }
  const { query, conversationId: existingId } = parsed.data;

  const conversationId = existingId ?? uuidv4();

  const embeddings = await createEmbeddings(query);
  if (!embeddings) {
    return sendError(res, 500, "Could not create embeddings!");
  }
  try {
    // here I am fetching the latest cached messages in redis
    const { messages: recentHistory, isExpired } =
      await getHistory(conversationId);

    // here i am fetching the semantic relevant messages using embeddings
    const relevantMessages = await retrieveRelevantMessages(
      conversationId,
      embeddings,
      5,
    );

    // then I merge both
    const recentContents = new Set(recentHistory.map((m) => m.content));
    const semanticContext = relevantMessages
      .filter((m) => !recentContents.has(m.content))
      .map(({ role, content }) => ({ role, content }));

    const fullContext = [...semanticContext, ...recentHistory];

    const messagesForLLM: ChatCompletionMessageParam[] = [SYSTEM_PROMPT];

    // this is a summary of the conversation up until now
    const conversation = await ConversationModel.findOne({
      conversationId,
    });
    const summary = conversation?.summary || "";
    if (summary) {
      messagesForLLM.push({
        role: "system",
        content: `[Conversation summary so far: ${summary}]`,
      });
    }
    messagesForLLM.push(...fullContext);
    messagesForLLM.push({ role: "user", content: query });

    logger.debug("Messages for LLM", {
  messagesForLLM
});

logger.debug(JSON.stringify(messagesForLLM, null, 2));

    // actual request
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: messagesForLLM,
    });
    const content = response?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("No content returned from model");
    }

    // 6. Persist both messages to MongoDB (with embeddings)
    const assistantEmbedding = await createEmbeddings(content);
    await storeMessage(conversationId, "user", query, embeddings);
    if (assistantEmbedding) {
      await storeMessage(
        conversationId,
        "assistant",
        content,
        assistantEmbedding,
      );
    }
    // 7. Update Redis with recent history
    const updatedHistory = [
      ...recentHistory,
      { role: "user" as const, content: query },
      { role: "assistant" as const, content },
    ];
    saveHistory(conversationId, trimHistory(updatedHistory)).catch((err) => 
      logger.error("Could not save history in redis", err)
    ).then(() => logger.info("history saved"))
    updateConversationSummary(conversationId, query, content).then((newSummary) => logger.info("SUMMARY SAVED", newSummary)).catch((err) =>
      logger.error("Delayed summary update failed", err),
    )
    return sendSuccess(res, 200, {
      conversationId: conversationId,
      sessionExpired: isExpired,
      query,
      content,
    });
  } catch (error) {
    logger.error(error)
    return sendError(res, 500, "Could not recieve a response from the agent!");
  }
};

export { simpleAgent };
