import { RequestContext } from "@mastra/core/request-context";
import type { ModelMode } from "../../config/models/model.types.js";

export type EonRequestContext = {
  opportunityId?: string;
  requestId?: string;
  agentId?: string;
  modelMode?: ModelMode;
  conversationId?: string;
};

export function buildAgentRequestContext(input: {
  opportunityId?: string;
  requestId?: string;
  agentId: string;
  modelMode: ModelMode;
  conversationId: string;
}) {
  const requestContext = new RequestContext<EonRequestContext>();

  if (input.opportunityId?.trim()) {
    requestContext.set("opportunityId", input.opportunityId.trim());
  }

  if (input.requestId) {
    requestContext.set("requestId", input.requestId);
  }

  requestContext.set("agentId", input.agentId);
  requestContext.set("modelMode", input.modelMode);
  requestContext.set("conversationId", input.conversationId);

  return requestContext;
}
