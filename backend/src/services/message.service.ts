import { MessageModel, type Message } from "../models/message.model.js";

export async function storeMessage(
  conversationId: string,
  role: Message["role"],
  content: string,
  embedding: number[],
  userId?: string,
): Promise<void> {
  await MessageModel.create({
    conversationId,
    ...(userId ? { userId } : {}),
    role,
    content,
    embedding,
  });
}

export async function retrieveRelevantMessages(
  conversationId: string,
  queryEmbedding: number[],
  topK = 5,
): Promise<Array<Message & { score: number }>> {
  const results = await MessageModel.aggregate([
    {
      $vectorSearch: {
        index: "message_embedding_index",
        path: "embedding",
        queryVector: queryEmbedding,
        numCandidates: 50,
        limit: topK,
        filter: { conversationId },
      },
    },
    {
      $project: {
        _id: 0,
        role: 1,
        content: 1,
        createdAt: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
  ]);

  return (results as (Message & { score: number })[]).sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
}
