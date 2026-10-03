import { describe, expect, it } from "vitest";
import {
  compactJson,
  compactToolResult,
  extractLabeledToolResults,
  normalizeToolName,
} from "../../../src/mastra/runtime/tool-results.js";

describe("tool result helpers", () => {
  it("matches new Sales tool aliases by toolCallId", () => {
    const steps = [
      {
        toolCalls: [{ payload: { toolCallId: "call-1", toolName: "querySales" } }],
        toolResults: [
          { payload: { toolCallId: "call-1", result: { summary: { actualRevenue: 10 } } } },
        ],
      },
    ];

    expect(extractLabeledToolResults(steps, "sales")).toEqual([
      {
        tool: "sales.query",
        result: { summary: { actualRevenue: 10 } },
      },
    ]);
  });

  it("normalizes local and cloud web-search names", () => {
    expect(normalizeToolName("webSearch", "sales")).toBe("web.search");
    expect(normalizeToolName("web_search", "sales")).toBe("openai.web_search");
  });

  it("removes transaction line noise from broad Opportunity model output", () => {
    const compact = compactToolResult("sales.get_opportunity", {
      opportunity: { noOpp: "OP1" },
      revenue: { actualRevenue: 100 },
      operations: {
        summary: { invoiceCount: 1 },
        salesOrders: [{ salesOrderNumber: "SO1" }],
        deliveries: [],
        invoices: [],
        salesOrderLines: [{ huge: "internal" }],
        deliveryLines: [{ huge: "internal" }],
        invoiceLines: [{ huge: "internal" }],
      },
    }) as any;

    expect(compact.operations.salesOrderLines).toBeUndefined();
    expect(compact.operations.summary.invoiceCount).toBe(1);
  });

  it("serializes compact JSON without pretty-print newlines", () => {
    expect(compactJson({ a: 1, b: { c: 2 } })).toBe('{"a":1,"b":{"c":2}}');
  });
});
