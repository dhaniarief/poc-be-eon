import { describe, expect, it } from "vitest";
import { buildAgentPrompt } from "../../../src/mastra/runtime/prompt-builder.js";

describe("buildAgentPrompt", () => {
  it("does not serialize opportunity context JSON into the model prompt", () => {
    const prompt = buildAgentPrompt({
      message: "Ringkas kondisi opportunity ini",
      agentId: "sales",
      hasOpportunityContext: true,
    });
    expect(prompt).toContain("Ringkas kondisi opportunity ini");
    expect(prompt).toContain("active opportunity");
    expect(prompt).not.toContain("59cf2a22");
    expect(prompt).not.toContain("Application context:");
  });
});
