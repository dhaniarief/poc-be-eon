import type { ModelMode } from "../../config/models/model.types.js";

export type UsageLike = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
};

function num(value: number | undefined) {
  return Number(value ?? 0);
}

export function buildAgentMetrics(input: {
  requestId?: string;
  agentId: string;
  modelMode: ModelMode;
  conversationId: string;
  opportunityId?: string;
  startedAt: number;
  finishReason?: string | null;
  synthesisFinishReason?: string | null;
  synthesisUsed: boolean;
  steps: number;
  textLength: number;
  firstUsage?: UsageLike;
  synthesisUsage?: UsageLike | null;
  toolsUsed: Array<{ tool: string }>;
}) {
  const first = input.firstUsage ?? {};
  const synthesis = input.synthesisUsage ?? {};

  return {
    event: "AI_RUN",
    requestId: input.requestId ?? null,
    agentId: input.agentId,
    modelMode: input.modelMode,
    conversationId: input.conversationId,
    opportunityId: input.opportunityId ?? null,
    status: "success",
    finishReason: input.finishReason ?? null,
    synthesisFinishReason: input.synthesisFinishReason ?? null,
    synthesisUsed: input.synthesisUsed,
    steps: input.steps,
    durationMs: Date.now() - input.startedAt,
    textLength: input.textLength,
    inputTokens: num(first.inputTokens) + num(synthesis.inputTokens),
    outputTokens: num(first.outputTokens) + num(synthesis.outputTokens),
    totalTokens: num(first.totalTokens) + num(synthesis.totalTokens),
    cachedInputTokens:
      num(first.cachedInputTokens) + num(synthesis.cachedInputTokens),
    reasoningTokens:
      num(first.reasoningTokens) + num(synthesis.reasoningTokens),
    toolCount: input.toolsUsed.length,
    toolsUsed: input.toolsUsed.map((item) => item.tool),
  };
}
