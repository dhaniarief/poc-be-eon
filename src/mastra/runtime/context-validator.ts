import { z } from "zod";

import { AppError } from "../../errors/app.error.js";

export type ChannelContext = {
  platform: string;

  channelId: string;

  threadId?: string;

  userId: string;

  messageId?: string;
};

export type AgentContext = {
  opportunityId?: string;

  channel?: ChannelContext;
};

const opportunityIdSchema = z.string().uuid();

export function validateAgentContext(agentId: string, context?: AgentContext) {
  if (agentId !== "sales") {
    return context ?? {};
  }

  if (!context?.opportunityId) {
    return context ?? {};
  }

  const parsed = opportunityIdSchema.safeParse(context.opportunityId);

  if (!parsed.success) {
    throw new AppError(
      "Sales opportunityId must be a valid UUID",
      400,
      "VALIDATION_ERROR",
    );
  }

  return {
    ...context,

    opportunityId: parsed.data,
  };
}
