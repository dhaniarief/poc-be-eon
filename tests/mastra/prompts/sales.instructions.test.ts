import { describe, expect, it } from "vitest";
import { salesAgentInstructions } from "../../../src/mastra/prompts/sales.instructions.js";

describe("salesAgentInstructions", () => {
  it("prevents redundant fine-grained internal calls after broad intelligence succeeds", () => {
    expect(salesAgentInstructions).toContain(
      "After getOpportunityIntelligence succeeds, do not repeat the same internal facts with overview, products, stage, stock, Sales Order, delivery, invoice, or MSDS tools unless the user explicitly asks for detail that is absent from the compact snapshot.",
    );
  });

  it("keeps route and web research outside the internal broad snapshot", () => {
    expect(salesAgentInstructions).toContain("Do not call route/location tools unless route/location is actually requested.");
    expect(salesAgentInstructions).toContain("web search for the public sections");
  });
});
