import type { ModelMode } from "../../config/models/model.types.js";
import { env } from "../../config/env.js";
import { writeBusinessEvent } from "../../logging/operation-logger.js";
import { getAgentKey } from "../agents/agent.registry.js";
import { mastra } from "../index.js";
import { agentMemory } from "../memory.js";
import { validateAgentContext, type AgentContext } from "./context-validator.js";
import { buildAgentRequestContext } from "./request-context.js";
import { buildAgentPrompt } from "./prompt-builder.js";
import { createToolTracker } from "./tool-tracker.js";
import {
  compactJson,
  extractLabeledToolResults,
  getToolName,
  normalizeToolName,
} from "./tool-results.js";
import { buildAgentMetrics, type UsageLike } from "./agent-metrics.js";

export type RunAgentInput = {
  agentId: string;
  modelMode: ModelMode;
  message: string;
  context?: AgentContext;
  conversationId: string;
  threadId?: string;
  resourceId?: string;
  requestId?: string;
};

function trackStepTools(
  steps: unknown[] | undefined,
  agentId: string,
  tracker: ReturnType<typeof createToolTracker>,
) {
  for (const stepValue of steps ?? []) {
    const step = stepValue as { toolCalls?: unknown[] };
    for (const toolCall of step.toolCalls ?? []) {
      const rawName = getToolName(toolCall);
      if (rawName) tracker.add({ tool: normalizeToolName(rawName, agentId) });
    }
  }
}

export async function runAgent(input: RunAgentInput) {
  const startedAt = Date.now();
  const {
    agentId,
    modelMode,
    message,
    context,
    conversationId,
    threadId,
    resourceId,
    requestId,
  } = input;

  try {
    if (!agentId) throw new Error("agentId is required");
    if (!conversationId) throw new Error("conversationId is required");
    if (typeof message !== "string") throw new Error("message must be a string");

    const userMessage = message.trim();
    if (!userMessage) throw new Error("message is empty");

    const validatedContext = validateAgentContext(agentId, context);
    const tracker = createToolTracker();
    const agentKey = getAgentKey(agentId, modelMode);
    const agent = mastra.getAgent(agentKey);

    const requestContext = buildAgentRequestContext({
      requestId,
      agentId,
      modelMode,
      conversationId,
      channel: validatedContext.channel,
      entities: validatedContext.entities,
    });

    const memoryOptions =
      agentMemory && threadId && resourceId
        ? { memory: { thread: threadId, resource: resourceId } }
        : {};

    const prompt = buildAgentPrompt({
      message: userMessage,
      entities: validatedContext.entities,
    });

    console.log("[AGENT RUN START]", {
      requestId: requestId ?? null,
      agentId,
      agentKey,
      modelMode,
      conversationId,
      threadId: threadId ?? null,
      resourceId: resourceId ?? null,
      contextEntities: Object.keys(validatedContext.entities ?? {}),
      messageLength: userMessage.length,
      memoryEnabled: Boolean(agentMemory && threadId && resourceId),
    });

    const firstPass = await agent.generate(prompt, {
      requestContext,
      ...memoryOptions,
      modelSettings: {
        maxOutputTokens: env.AGENT_MAX_OUTPUT_TOKENS,
        ...(modelMode === "local" ? { temperature: 0.1 } : {}),
      },
    });

    trackStepTools(firstPass.steps as unknown[] | undefined, agentId, tracker);

    let finalText = String(firstPass.text ?? "").trim();
    let synthesisUsage: UsageLike | null = null;
    let synthesisFinishReason: string | null = null;
    let synthesisUsed = false;

    if (modelMode === "local") {
      const labeledToolResults = extractLabeledToolResults(
        (firstPass.steps ?? []) as unknown[],
        agentId,
      );
      const needsSynthesis =
        labeledToolResults.length > 0 &&
        (finalText.length === 0 ||
          firstPass.finishReason === "tool-calls" ||
          firstPass.finishReason === "length");

      if (needsSynthesis) {
        synthesisUsed = true;
        const synthesisAgent = mastra.getAgent("localSynthesis");
        const secondPass = await synthesisAgent.generate(
          `USER QUESTION\n${userMessage}\n\nVERIFIED TOOL RESULTS\n${compactJson(labeledToolResults)}\n\nCreate a concise final answer using only these verified results.`,
          {
            requestContext,
            modelSettings: {
              maxOutputTokens: env.AGENT_MAX_OUTPUT_TOKENS,
              temperature: 0.1,
            },
          },
        );

        synthesisUsage = secondPass.usage as UsageLike;
        synthesisFinishReason = secondPass.finishReason ?? null;
        const synthesisText = String(secondPass.text ?? "").trim();
        if (synthesisText) finalText = synthesisText;
      }
    }

    if (!finalText) {
      finalText =
        tracker.getAll().length > 0
          ? "Data berhasil diambil, tetapi model tidak berhasil menyusun jawaban akhir."
          : "Model tidak berhasil menghasilkan jawaban.";
    }

    const toolsUsed = tracker.getAll();
    const metrics = buildAgentMetrics({
      requestId,
      agentId,
      modelMode,
      conversationId,
      startedAt,
      finishReason: firstPass.finishReason ?? null,
      synthesisFinishReason,
      synthesisUsed,
      steps: firstPass.steps?.length ?? 0,
      textLength: finalText.length,
      firstUsage: firstPass.usage as UsageLike,
      synthesisUsage,
      toolsUsed,
    });

    const { event, ...metricPayload } = metrics;
    writeBusinessEvent("info", event, metricPayload);

    console.log("[AGENT RUN SUCCESS]", {
      requestId: requestId ?? null,
      agentId,
      modelMode,
      conversationId,
      toolsUsed: toolsUsed.map((item) => item.tool),
      synthesisUsed,
      durationMs: Date.now() - startedAt,
    });

    return {
      text: finalText,
      steps: firstPass.steps,
      toolsUsed,
      metrics,
      conversationId,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message.slice(0, 240)
        : "Unknown agent execution error";

    writeBusinessEvent("error", "AI_RUN", {
      requestId: requestId ?? null,
      agentId,
      modelMode,
      conversationId,
      status: "failed",
      durationMs: Date.now() - startedAt,
      error: errorMessage,
    });

    console.error("[AGENT RUN FAILED]", {
      requestId: requestId ?? null,
      agentId,
      modelMode,
      conversationId,
      durationMs: Date.now() - startedAt,
      error,
    });

    throw error;
  }
}
