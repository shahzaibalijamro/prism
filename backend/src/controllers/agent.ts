import z from "zod";
import type { Response, Request } from "express";
import { createEmbeddings } from "../utils/embeddings.js";
import { sendError, sendSuccess } from "../utils/response-handler.js";
import { groq } from "../config/config.js";
import logger from "../config/logger.js";

const simpleAgentSchema = z.object({
  query: z.string().min(5),
});

const simpleAgent = async (req: Request, res: Response) => {
  const parsed = simpleAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, "Invalid input", parsed.error.message);
  }
  const { query } = parsed.data;
  const embeddings = await createEmbeddings(query);
  if (!embeddings) {
    return sendError(res, 500, "Could not create embeddings!");
  }
  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `You are the Devil's Advocate. Your role is to 
        challenge every assumption, find the flaws in every argument, and 
        expose the risks in every plan. You are not negative — you are the 
        voice that prevents people from being blindly optimistic. Your output 
        should be structured: first, the core assumption you are challenging, 
        then your three strongest counterarguments, then the worst-case 
        scenario if those counterarguments prove true. Be specific, not vague.`,
        },
        {
          role: "user",
          content: query,
        },
      ],
    });
    const content = response?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("No content returned from model");
    }
    return sendSuccess(res, 200, { query, content });
  } catch (error) {
    return sendError(res, 500, "Could not recieve a response from the agent!");
  }
};

export { simpleAgent };
