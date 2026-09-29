import { z } from "zod";

export const channelContextSchema = z.object({
  platform: z.string().min(1),
  channelId: z.string().min(1),
  threadId: z.string().min(1).optional(),
  userId: z.string().min(1),
  messageId: z.string().min(1).optional(),
});

export const opportunityRequestContextSchema = z.object({
  opportunityId: z.string().uuid().optional(),

  requestId: z.string().min(1).optional(),

  agentId: z.string().min(1).optional(),

  modelMode: z.enum(["local", "cloud"]).optional(),

  conversationId: z.string().min(1).optional(),

  channel: channelContextSchema.optional(),
});

export function requireOpportunityId(context: unknown): string {
  const toolContext = context as
    | { requestContext?: { get?: (key: string) => unknown } }
    | undefined;

  const parsed = z
    .string()
    .uuid()
    .safeParse(toolContext?.requestContext?.get?.("opportunityId"));

  if (!parsed.success) {
    throw new Error("Valid opportunityId is missing from RequestContext.");
  }

  return parsed.data;
}
