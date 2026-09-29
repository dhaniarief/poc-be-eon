import { describe, expect, it } from "vitest";
import {
  compactJson,
  compactToolResult,
  extractLabeledToolResults,
  normalizeToolName,
} from "../../../src/mastra/runtime/tool-results.js";

describe("tool result helpers", () => {
  it("matches tool results to calls by toolCallId", () => {
    const steps = [
      {
        toolCalls: [
          {
            payload: {
              toolCallId: "call-1",
              toolName: "getInvoices",
            },
          },
        ],
        toolResults: [
          {
            payload: {
              toolCallId: "call-1",
              result: { totalInvoices: 1 },
            },
          },
        ],
      },
    ];

    expect(extractLabeledToolResults(steps, "sales")).toEqual([
      {
        tool: "finops.get_invoices",
        result: {
          noOpp: "",
          totalSalesOrders: 0,
          totalInvoices: 1,
          totalInvoiceAmount: 0,
          invoices: [],
        },
      },
    ]);
  });

  it("normalizes local and cloud web-search names", () => {
    expect(normalizeToolName("webSearch", "sales")).toBe("web.search");
    expect(normalizeToolName("web_search", "sales")).toBe("openai.web_search");
  });

  it("compacts stock results before Local synthesis", () => {
    const compact = compactToolResult("finops.check_stock_availability", {
      warehouse: "PTM",
      summary: { total: 1, sufficient: 0, shortage: 1, unresolved: 0 },
      items: [
        {
          productName: "P1",
          itemNumber: "FG1",
          productNumber: "PR1",
          requestedQuantity: 2,
          available: 0,
          stockStatus: "SHORTAGE",
          finopsProductName: "large internal field",
          opportunityProductId: "internal-id",
        },
      ],
    }) as any;

    expect(compact.items[0]).toEqual({
      productName: "P1",
      itemNumber: "FG1",
      requestedQuantity: 2,
      available: 0,
      stockStatus: "SHORTAGE",
    });
  });

  it("serializes compact JSON without pretty-print newlines", () => {
    expect(compactJson({ a: 1, b: { c: 2 } })).toBe('{"a":1,"b":{"c":2}}');
  });
});
