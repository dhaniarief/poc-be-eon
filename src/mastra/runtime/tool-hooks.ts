import { writeBusinessEvent } from "../../logging/operation-logger.js";
import { normalizeToolName } from "./tool-results.js";

function normalizeTool(toolName: string) {
  return normalizeToolName(toolName, "agent");
}

function toolSource(toolName: string) {
  return normalizeTool(toolName).split(".")[0] || "unknown";
}

export const eonToolHooks = {
  beforeToolCall: ({ toolName }: { toolName: string }) => {
    writeBusinessEvent("info", "AI_TOOL", {
      phase: "start",
      tool: normalizeTool(toolName),
      source: toolSource(toolName),
    });
  },
  afterToolCall: ({
    toolName,
    error,
  }: {
    toolName: string;
    output?: unknown;
    error?: unknown;
  }) => {
    writeBusinessEvent(error ? "warn" : "info", "AI_TOOL", {
      phase: "complete",
      tool: normalizeTool(toolName),
      source: toolSource(toolName),
      status: error ? "failed" : "success",
      ...(error
        ? {
            error:
              error instanceof Error
                ? error.message.slice(0, 180)
                : "Tool execution failed",
          }
        : {}),
    });
  },
};
