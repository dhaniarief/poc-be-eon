import type { ModelMode } from "../../config/models/model.types.js";
import { env } from "../../config/env.js";
import { writeBusinessEvent } from "../../logging/operation-logger.js";
import { getAgentKey } from "../agents/agent.registry.js";
import { mastra } from "../index.js";
import { agentMemory } from "../memory.js";
import {
  validateAgentContext,
  type AgentContext,
} from "./context-validator.js";
import { buildAgentRequestContext } from "./request-context.js";
import { buildAgentPrompt } from "./prompt-builder.js";
import { createToolTracker } from "./tool-tracker.js";
import { normalizeTeamsMessage } from "../../services/teams/teams-message.service.js";
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
      if (!rawName) continue;

      tracker.add({
        tool: normalizeToolName(rawName, agentId),
      });
    }
  }
}

export async function runAgent(input: RunAgentInput) {
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
  const normalizedMessage = normalizeTeamsMessage(message);
  const startedAt = Date.now();
  const validatedContext = validateAgentContext(agentId, context);
  const opportunityId = validatedContext?.opportunityId;
  const toolTracker = createToolTracker();

  try {
    const agent = mastra.getAgent(getAgentKey(agentId, modelMode));

    const requestContext = buildAgentRequestContext({
      opportunityId,

      requestId,

      agentId,

      modelMode,

      conversationId,

      channel: validatedContext?.channel,
    });

    const memoryOptions =
      agentMemory && threadId && resourceId
        ? {
            memory: {
              thread: threadId,
              resource: resourceId,
            },
          }
        : {};

    const prompt = buildAgentPrompt({
      message: normalizedMessage.normalizedText || normalizedMessage.rawText,
      agentId,
      hasOpportunityContext: Boolean(opportunityId),
    });

    const firstPass = await agent.generate(prompt, {
      requestContext,
      ...memoryOptions,
      modelSettings: {
        maxOutputTokens: env.AGENT_MAX_OUTPUT_TOKENS,
        ...(modelMode === "local" ? { temperature: 0.1 } : {}),
      },
    });

    trackStepTools(
      firstPass.steps as unknown[] | undefined,
      agentId,
      toolTracker,
    );

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
        const synthesisPrompt = `USER QUESTION
${(normalizedMessage.normalizedText || normalizedMessage.rawText).trim()}

VERIFIED TOOL RESULTS
${compactJson(labeledToolResults)}

Create a concise final answer using only these verified results.`;
        const secondPass = await synthesisAgent.generate(synthesisPrompt, {
          requestContext,
          modelSettings: {
            maxOutputTokens: env.AGENT_MAX_OUTPUT_TOKENS,
            temperature: 0.1,
          },
        });

        synthesisUsage = secondPass.usage as UsageLike;
        synthesisFinishReason = secondPass.finishReason ?? null;

        const synthesisText = String(secondPass.text ?? "").trim();
        if (synthesisText) {
          finalText = synthesisText;
        }
      }
    }

    if (!finalText) {
      const usedTools = toolTracker.getAll().map((item) => item.tool);
      finalText = usedTools.length
        ? `Data berhasil diambil menggunakan ${usedTools.length} tool, tetapi model tidak berhasil menyusun jawaban akhir.`
        : "Model tidak berhasil menghasilkan jawaban.";
    }

    const toolsUsed = toolTracker.getAll();
    const metrics = buildAgentMetrics({
      requestId,
      agentId,
      modelMode,
      conversationId,
      opportunityId,
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

    return {
      text: finalText,
      steps: firstPass.steps,
      toolsUsed,
      metrics,
      conversationId,
    };
  } catch (error) {
    writeBusinessEvent("error", "AI_RUN", {
      requestId: requestId ?? null,
      agentId,
      modelMode,
      conversationId,
      opportunityId: opportunityId ?? null,
      status: "failed",
      durationMs: Date.now() - startedAt,
      error:
        error instanceof Error
          ? error.message.slice(0, 240)
          : "Unknown agent execution error",
    });
    throw error;
  }
}
