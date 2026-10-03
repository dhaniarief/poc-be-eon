import { RequestContext } from "@mastra/core/request-context";
import { z } from "zod";
import type { ModelMode } from "../../config/models/model.types.js";

export const teamsChannelContextSchema = z.object({
  platform: z.literal("teams"),
  channelId: z.string().min(1),
  threadId: z.string().min(1).optional(),
  userId: z.string().min(1),
  messageId: z.string().min(1).optional(),
});

export const entityContextRefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
});

/**
 * Generic request context. Business entities are optional host-supplied hints,
 * not persisted "active" state and not a replacement for live CRM/FinOps data.
 *
 * To add a new contextual entity later, no runtime schema change is required:
 *   entities: { vendor: { id: "...", name: "..." } }
 */
export const agentRequestContextSchema = z.object({
  requestId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  modelMode: z.enum(["local", "cloud"]).optional(),
  conversationId: z.string().min(1).optional(),
  channel: teamsChannelContextSchema.optional(),
  entities: z.record(z.string(), entityContextRefSchema).optional(),
});

export type ChannelRequestContext = z.infer<typeof teamsChannelContextSchema>;
export type EntityContextRef = z.infer<typeof entityContextRefSchema>;
export type EntityContext = Record<string, EntityContextRef>;

export type EonRequestContext = {
  requestId?: string;
  agentId?: string;
  modelMode?: ModelMode;
  conversationId?: string;
  channel?: ChannelRequestContext;
  entities?: EntityContext;
};

export function buildAgentRequestContext(input: {
  requestId?: string;
  agentId: string;
  modelMode: ModelMode;
  conversationId: string;
  channel?: ChannelRequestContext;
  entities?: EntityContext;
}) {
  const requestContext = new RequestContext<EonRequestContext>();

  if (input.requestId) requestContext.set("requestId", input.requestId);
  requestContext.set("agentId", input.agentId);
  requestContext.set("modelMode", input.modelMode);
  requestContext.set("conversationId", input.conversationId);

  if (input.channel) requestContext.set("channel", input.channel);
  if (input.entities && Object.keys(input.entities).length > 0) {
    requestContext.set("entities", input.entities);
  }

  return requestContext;
}
