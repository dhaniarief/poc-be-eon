import { compactToolResult } from "./model-output.js";

const toolAliasMap: Record<string, string> = {
  getOpportunityIntelligence: "common.get_opportunity_intelligence",
  getOpportunityOverview: "crm.get_opportunity_overview",
  getOpportunityProducts: "crm.get_opportunity_products",
  getOpportunityActivities: "crm.get_opportunity_activities",
  getOpportunityStage: "crm.get_opportunity_stage",

  resolveOpportunityItems: "finops.resolve_opportunity_items",
  checkStockAvailability: "finops.check_stock_availability",
  getSalesOrders: "finops.get_sales_orders",
  getDeliveryStatus: "finops.get_delivery_status",
  getInvoices: "finops.get_invoices",

  getDeliveryContext: "common.get_delivery_context",
  getRouteEstimate: "common.get_route_estimate",

  getMsds: "sharepoint.get_msds",

  searchKnowledge: "knowledge.search",

  currentTime: "common.get_current_time",
  webSearch: "web.search",
  searxngWebSearch: "web.search",
  web_search: "openai.web_search",
};

export function normalizeToolName(rawToolName: string, agentId: string) {
  if (rawToolName.includes(".")) {
    return rawToolName;
  }

  return toolAliasMap[rawToolName] ?? `${agentId}.${rawToolName}`;
}

export function getToolName(toolCall: unknown): string | null {
  const call = toolCall as {
    payload?: { toolName?: unknown; name?: unknown };
    toolName?: unknown;
    name?: unknown;
  };

  const value =
    call?.payload?.toolName ??
    call?.payload?.name ??
    call?.toolName ??
    call?.name;

  return typeof value === "string" ? value : null;
}

export function getToolCallId(value: unknown): string | null {
  const item = value as {
    payload?: { toolCallId?: unknown; id?: unknown };
    toolCallId?: unknown;
    id?: unknown;
  };

  const candidate =
    item?.payload?.toolCallId ??
    item?.payload?.id ??
    item?.toolCallId ??
    item?.id;

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
    const step = stepValue as {
      toolCalls?: unknown[];
      toolResults?: unknown[];
    };

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
