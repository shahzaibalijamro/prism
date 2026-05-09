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
  content: `You are the Devil's Advocate. Your role is to challenge every 
  assumption, find the flaws in every argument, and expose the risks in every 
  plan. You are not negative — you are the voice that prevents people from 
  being blindly optimistic. Your output should be structured: first, the core 
  assumption you are challenging, then your three strongest counterarguments, 
  then the worst-case scenario if those counterarguments prove true. Be specific, not vague.`,
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
    updateConversationSummary(conversationId, query, content).catch((err) =>
      logger.error("Delayed summary update failed", err),
    ).then((newSummary) => logger.info("SUMMARY SAVED", newSummary))
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
