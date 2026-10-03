import { compactToolResult } from "./model-output.js";

const toolAliasMap: Record<string, string> = {
  resolveEntity: "sales.resolve_entity",
  querySales: "sales.query",
  getOpportunity: "sales.get_opportunity",
  checkStock: "sales.check_stock",
  getMsds: "sales.get_msds",
  searchKnowledge: "knowledge.search",
  currentTime: "common.get_current_time",
  webSearch: "web.search",
  searxngWebSearch: "web.search",
  web_search: "openai.web_search",
};

export function normalizeToolName(rawToolName: string, agentId: string) {
  if (rawToolName.includes(".")) return rawToolName;
  return toolAliasMap[rawToolName] ?? `${agentId}.${rawToolName}`;
}

export function getToolName(toolCall: unknown): string | null {
  const call = toolCall as {
    payload?: { toolName?: unknown; name?: unknown };
    toolName?: unknown;
    name?: unknown;
  };
  const value =
    call?.payload?.toolName ?? call?.payload?.name ?? call?.toolName ?? call?.name;
  return typeof value === "string" ? value : null;
}

export function getToolCallId(value: unknown): string | null {
  const item = value as {
    payload?: { toolCallId?: unknown; id?: unknown };
    toolCallId?: unknown;
    id?: unknown;
  };
  const candidate =
    item?.payload?.toolCallId ?? item?.payload?.id ?? item?.toolCallId ?? item?.id;
  return typeof candidate === "string" ? candidate : null;
}

export function getToolResultValue(toolResult: unknown): unknown {
  const result = toolResult as {
    payload?: { result?: unknown; output?: unknown };
    result?: unknown;
    output?: unknown;
  };
  return (
    result?.payload?.result ??
    result?.payload?.output ??
    result?.result ??
    result?.output ??
    null
  );
}

export function extractLabeledToolResults(
  steps: unknown[],
  agentId: string,
): Array<{ tool: string; result: unknown }> {
  return steps.flatMap((stepValue) => {
    const step = stepValue as { toolCalls?: unknown[]; toolResults?: unknown[] };
    const calls = step.toolCalls ?? [];
    const results = step.toolResults ?? [];
    const normalizedCalls = calls.map((call, index) => ({
      index,
      id: getToolCallId(call),
      name: getToolName(call),
    }));

    return results.map((toolResult, index) => {
      const resultCallId = getToolCallId(toolResult);
      const matchingCall =
        (resultCallId
          ? normalizedCalls.find((call) => call.id === resultCallId)
          : undefined) ?? normalizedCalls[index];
      const rawName = matchingCall?.name ?? `unknown_tool_${index + 1}`;
      const tool = normalizeToolName(rawName, agentId);
      return {
        tool,
        result: compactToolResult(tool, getToolResultValue(toolResult)),
      };
    });
  });
}

export function compactJson(value: unknown): string {
  return JSON.stringify(value);
}

export { compactToolResult } from "./model-output.js";
