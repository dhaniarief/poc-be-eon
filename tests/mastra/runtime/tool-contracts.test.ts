import { describe, expect, it } from "vitest";
import { getAgentKey, registeredAgents } from "../../../src/mastra/agents/agent.registry.js";
import { registeredWorkflows } from "../../../src/mastra/workflows/workflow.registry.js";
import { agentRequestContextSchema } from "../../../src/mastra/runtime/request-context.js";
import { salesTools } from "../../../src/mastra/tools/tool.registry.js";

describe("Mastra extension contracts", () => {
  it("keeps agent registration data-driven", () => {
    expect(getAgentKey("sales", "local")).toBe("salesLocal");
    expect(getAgentKey("general", "cloud")).toBe("generalCloud");
    expect(Object.keys(registeredAgents)).toContain("localSynthesis");
  });

  it("keeps the Sales model-visible tool surface small", () => {
    expect(Object.keys(salesTools)).toEqual([
      "resolveEntity",
      "querySales",
      "getOpportunity",
      "checkStock",
      "getMsds",
    ]);
  });

  it("accepts arbitrary future entity types as host context", () => {
    const parsed = agentRequestContextSchema.safeParse({
      requestId: "req-1",
      agentId: "sales",
      modelMode: "local",
      conversationId: "conv-1",
      entities: {
        opportunity: { id: "opp-1", name: "OP001" },
        vendor: { id: "vendor-1", name: "Vendor A" },
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("starts with no production workflows", () => {
    expect(Object.keys(registeredWorkflows)).toEqual([]);
  });
});
