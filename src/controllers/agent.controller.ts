import type { Request, Response } from "express";
import { resolveConversationIdentity } from "../mastra/runtime/conversation.js";
import { runAgent } from "../mastra/runtime/agent.runner.js";

export async function chatAgent(req: Request, res: Response) {
  const {
    message,
    modelMode,
    context,
    conversationId,
    threadId: legacyThreadId,
  } = req.body;

  const agentId = req.params.agentId;

  if (Array.isArray(agentId)) {
    throw new Error("Invalid agent id");
  }

  const conversation = resolveConversationIdentity({
    userId: req.user?.userId,
    conversationId,
    legacyThreadId,
  });

  const result = await runAgent({
    agentId,
    modelMode,
    message,
    context,
    conversationId: conversation.conversationId,
    threadId: conversation.threadId,
    resourceId: conversation.resourceId,
    requestId: req.requestId,
  });

  res.status(200).json({
    answer: result.text,
    agentId,
    modelMode,
    userId: req.user?.userId,
    opportunityId: context?.opportunityId,
    requestId: req.requestId,
    conversationId: conversation.conversationId,
    toolsUsed: result.toolsUsed,
    metrics: result.metrics,
  });
}
