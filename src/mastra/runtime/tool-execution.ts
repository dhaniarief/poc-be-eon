import { z } from "zod";

import { env } from "../../config/env.js";

import { channelContextSchema } from "./opportunity-context.js";

import { getActiveOpportunityContext } from "../../services/teams/teams-opportunity-context.service.js";

type OpportunityContextKey =
  | "opportunityId"
  | "requestId"
  | "agentId"
  | "modelMode"
  | "conversationId"
  | "channel";

function getRequestContextValue(
  context: unknown,
  key: OpportunityContextKey,
): unknown {
  const toolContext = context as
    | {
        requestContext?: unknown;
      }
    | undefined;

  const requestContext = toolContext?.requestContext;

  if (!requestContext || typeof requestContext !== "object") {
    return undefined;
  }

  const get = (requestContext as { get?: unknown }).get;

  if (typeof get !== "function") {
    return undefined;
  }

  return (get as (key: OpportunityContextKey) => unknown).call(
    requestContext,
    key,
  );
}

async function resolveOpportunityId(context: unknown): Promise<string> {
  //
  // 1. Existing CRM Web / API flow
  //
  const directOpportunityId = z
    .string()
    .uuid()
    .safeParse(getRequestContextValue(context, "opportunityId"));

  if (directOpportunityId.success) {
    return directOpportunityId.data;
  }

  //
  // 2. Microsoft Teams flow
  //
  const channelResult = channelContextSchema.safeParse(
    getRequestContextValue(context, "channel"),
  );

  if (!channelResult.success) {
    throw new Error(
      "Valid opportunityId is missing from RequestContext and no Teams channel context is available.",
    );
  }

  const channel = channelResult.data;

  if (channel.platform !== "teams") {
    throw new Error("Valid opportunityId is missing from RequestContext.");
  }

  const activeOpportunity = await getActiveOpportunityContext({
    tenantId: env.TEAMS_APP_TENANT_ID,
    platform: channel.platform,
    channelId: channel.channelId,
    threadId: channel.threadId ?? "",
    userId: channel.userId,
  });

  if (!activeOpportunity) {
    throw new Error(
      "No active opportunity is available for this Microsoft Teams conversation. Please select an Opportunity Number first.",
    );
  }

  console.log("[ACTIVE OPPORTUNITY RESOLVED]", {
    source: "teams_context",
    opportunityNo: activeOpportunity.opportunityNo,
    opportunityId: activeOpportunity.opportunityId,
  });

  return activeOpportunity.opportunityId;
}

export async function runOpportunityTool<T>(input: {
  context: unknown;

  execute: (opportunityId: string) => Promise<T>;
}): Promise<T> {
  const opportunityId = await resolveOpportunityId(input.context);

  return input.execute(opportunityId);
}
