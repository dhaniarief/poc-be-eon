import { describe, expect, it } from "vitest";
import { getAgentKey, registeredAgents } from "../../../src/mastra/agents/agent.registry.js";
import { registeredWorkflows } from "../../../src/mastra/workflows/workflow.registry.js";
import { opportunityRequestContextSchema } from "../../../src/mastra/runtime/opportunity-context.js";

describe("Mastra extension contracts", () => {
  it("resolves registered agents without runner-specific branches", () => {
    expect(getAgentKey("sales", "local")).toBe("salesLocal");
    expect(getAgentKey("general", "cloud")).toBe("generalCloud");
    expect(Object.keys(registeredAgents)).toContain("localSynthesis");
  });

  it("starts with no thin production workflows", () => {
    expect(Object.keys(registeredWorkflows)).toEqual([]);
  });

  it("validates shared opportunity request context", () => {
    const parsed = opportunityRequestContextSchema.safeParse({
      opportunityId: "59cf2a22-6281-4465-9232-8ebeab009e5e",
      requestId: "req-1",
      agentId: "sales",
      modelMode: "local",
      conversationId: "conv-1",
    });
    expect(parsed.success).toBe(true);
  });
});
