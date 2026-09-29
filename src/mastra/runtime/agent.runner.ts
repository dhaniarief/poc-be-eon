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

/**
 * Track tool calls dari semua Mastra steps.
 */
function trackStepTools(
  steps: unknown[] | undefined,

  agentId: string,

  tracker: ReturnType<typeof createToolTracker>,
) {
  for (const stepValue of steps ?? []) {
    const step = stepValue as {
      toolCalls?: unknown[];
    };

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
  /**
   * startedAt diletakkan paling awal supaya seluruh
   * proses tercatat, termasuk preprocessing.
   */
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

  /**
   * opportunityId dibuat di luar try agar masih
   * tersedia ketika error logging.
   */
  let opportunityId: string | undefined = undefined;

  try {
    /**
     * ========================================================
     * VALIDATE INPUT
     * ========================================================
     */

    if (!agentId) {
      throw new Error("agentId is required");
    }

    if (!conversationId) {
      throw new Error("conversationId is required");
    }

    if (typeof message !== "string") {
      throw new Error("message must be a string");
    }

    /**
     * ========================================================
     * NORMALIZE MESSAGE
     * ========================================================
     *
     * Untuk sekarang tetap kita pertahankan karena
     * existing architecture kamu menggunakan Teams normalizer.
     *
     * Nantinya sebaiknya dipindahkan ke Teams boundary.
     */
    const normalizedMessage = normalizeTeamsMessage(message);

    const userMessage = String(
      normalizedMessage.normalizedText || normalizedMessage.rawText || message,
    ).trim();

    if (!userMessage) {
      throw new Error("Normalized message is empty");
    }

    /**
     * ========================================================
     * VALIDATE CONTEXT
     * ========================================================
     */
    const validatedContext = validateAgentContext(agentId, context);

    opportunityId = validatedContext?.opportunityId;

    /**
     * ========================================================
     * TOOL TRACKER
     * ========================================================
     */
    const toolTracker = createToolTracker();

    /**
     * ========================================================
     * GET AGENT
     * ========================================================
     */
    const agentKey = getAgentKey(agentId, modelMode);

    const agent = mastra.getAgent(agentKey);

    /**
     * ========================================================
     * REQUEST CONTEXT
     * ========================================================
     */
    const requestContext = buildAgentRequestContext({
      opportunityId,

      requestId,

      agentId,

      modelMode,

      conversationId,

      channel: validatedContext?.channel,
    });

    /**
     * ========================================================
     * MEMORY
     * ========================================================
     *
     * Thread:
     * Teams conversation/thread
     *
     * Resource:
     * Teams user
     */
    const memoryOptions =
      agentMemory && threadId && resourceId
        ? {
            memory: {
              thread: threadId,

              resource: resourceId,
            },
          }
        : {};

    /**
     * ========================================================
     * PROMPT
     * ========================================================
     */
    const prompt = buildAgentPrompt({
      message: userMessage,

      agentId,

      hasOpportunityContext: Boolean(opportunityId),
    });

    console.log("[AGENT RUN START]", {
      requestId: requestId ?? null,

      agentId,

      agentKey,

      modelMode,

      conversationId,

      threadId: threadId ?? null,

      resourceId: resourceId ?? null,

      opportunityId: opportunityId ?? null,

      messageLength: userMessage.length,

      memoryEnabled: Boolean(agentMemory && threadId && resourceId),
    });

    /**
     * ========================================================
     * FIRST PASS
     * ========================================================
     */
    const firstPass = await agent.generate(prompt, {
      requestContext,

      ...memoryOptions,

      modelSettings: {
        maxOutputTokens: env.AGENT_MAX_OUTPUT_TOKENS,

        ...(modelMode === "local"
          ? {
              temperature: 0.1,
            }
          : {}),
      },
    });

    /**
     * ========================================================
     * TRACK TOOLS
     * ========================================================
     */
    trackStepTools(
      firstPass.steps as unknown[] | undefined,

      agentId,

      toolTracker,
    );

    /**
     * ========================================================
     * INITIAL FINAL TEXT
     * ========================================================
     */
    let finalText = String(firstPass.text ?? "").trim();

    let synthesisUsage: UsageLike | null = null;

    let synthesisFinishReason: string | null = null;

    let synthesisUsed = false;

    /**
     * ========================================================
     * LOCAL MODEL SYNTHESIS
     * ========================================================
     *
     * Cloud model biasanya mampu menjawab setelah tool call.
     *
     * Beberapa local model kadang berhenti setelah tool call,
     * sehingga kita lakukan synthesis pass.
     */
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
${userMessage}

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

    /**
     * ========================================================
     * FALLBACK RESPONSE
     * ========================================================
     */
    if (!finalText) {
      const usedTools = toolTracker.getAll().map((item) => item.tool);

      finalText =
        usedTools.length > 0
          ? `Data berhasil diambil menggunakan ${usedTools.length} tool, tetapi model tidak berhasil menyusun jawaban akhir.`
          : "Model tidak berhasil menghasilkan jawaban.";
    }

    /**
     * ========================================================
     * METRICS
     * ========================================================
     */
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

    console.log("[AGENT RUN SUCCESS]", {
      requestId: requestId ?? null,

      agentId,

      modelMode,

      conversationId,

      opportunityId: opportunityId ?? null,

      finishReason: firstPass.finishReason ?? null,

      steps: firstPass.steps?.length ?? 0,

      toolsUsed: toolsUsed.map((item) => item.tool),

      synthesisUsed,

      textLength: finalText.length,

      durationMs: Date.now() - startedAt,
    });

    /**
     * ========================================================
     * RESULT
     * ========================================================
     */
    return {
      text: finalText,

      steps: firstPass.steps,

      toolsUsed,

      metrics,

      conversationId,
    };
  } catch (error) {
    /**
     * Karena try/catch sekarang membungkus seluruh
     * process, error dari:
     *
     * normalizeTeamsMessage()
     * validateAgentContext()
     * getAgentKey()
     * mastra.getAgent()
     * buildAgentPrompt()
     * agent.generate()
     *
     * semuanya akan tercatat.
     */
    const errorMessage =
      error instanceof Error
        ? error.message.slice(0, 240)
        : "Unknown agent execution error";

    writeBusinessEvent("error", "AI_RUN", {
      requestId: requestId ?? null,

      agentId,

      modelMode,

      conversationId,

      opportunityId: opportunityId ?? null,

      status: "failed",

      durationMs: Date.now() - startedAt,

      error: errorMessage,
    });

    console.error("[AGENT RUN FAILED]", {
      requestId: requestId ?? null,

      agentId,

      modelMode,

      conversationId,

      threadId: threadId ?? null,

      resourceId: resourceId ?? null,

      opportunityId: opportunityId ?? null,

      durationMs: Date.now() - startedAt,

      error,
    });

    throw error;
  }
}
