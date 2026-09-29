import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError } from "../../errors/app.error.js";

const conversationIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

export type ConversationIdentity = {
  conversationId: string;
  threadId: string;
  resourceId: string;
};

export function resolveConversationIdentity(input: {
  userId?: string;
  conversationId?: string;
  legacyThreadId?: string;
}): ConversationIdentity {
  const userId = input.userId?.trim();

  if (!userId) {
    throw new AppError("Authenticated user is required", 401, "UNAUTHORIZED");
  }

  const requested = input.conversationId ?? input.legacyThreadId;

  // Explicitly widen randomUUID() to string.
  // Existing conversation IDs are allowed to be non-UUID strings.
  let conversationId: string = randomUUID();

  if (requested) {
    const parsed = conversationIdSchema.safeParse(requested);

    if (!parsed.success) {
      throw new AppError("Invalid conversationId", 400, "VALIDATION_ERROR");
    }

    conversationId = parsed.data;
  }

  return {
    conversationId,
    threadId: conversationId,
    resourceId: userId,
  };
}
