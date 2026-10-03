import { z } from "zod";
import { AppError } from "../../errors/app.error.js";
import {
  entityContextRefSchema,
  teamsChannelContextSchema,
  type ChannelRequestContext,
  type EntityContext,
} from "./request-context.js";

export type AgentContext = {
  channel?: ChannelRequestContext;
  entities?: EntityContext;
};

const agentContextSchema = z.object({
  channel: teamsChannelContextSchema.optional(),
  entities: z.record(z.string(), entityContextRefSchema).optional(),
});

export function validateAgentContext(_agentId: string, context?: AgentContext) {
  if (!context) return {};

  const parsed = agentContextSchema.safeParse(context);
  if (!parsed.success) {
    throw new AppError(
      "Invalid agent context",
      400,
      "VALIDATION_ERROR",
    );
  }

  return parsed.data;
}
