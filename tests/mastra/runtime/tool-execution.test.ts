import { describe, expect, it, vi } from "vitest";
import { RequestContext } from "@mastra/core/request-context";
import { runOpportunityTool } from "../../../src/mastra/runtime/tool-execution.js";

describe("runOpportunityTool", () => {
  it("reads opportunityId from RequestContext and passes it to the service", async () => {
    const requestContext = new RequestContext<any>();
    requestContext.set("opportunityId", "59cf2a22-6281-4465-9232-8ebeab009e5e");
    const execute = vi.fn(async (id: string) => ({ id }));

    const result = await runOpportunityTool({
      context: { requestContext },
      execute,
    });

    expect(execute).toHaveBeenCalledWith("59cf2a22-6281-4465-9232-8ebeab009e5e");
    expect(result.id).toBe("59cf2a22-6281-4465-9232-8ebeab009e5e");
  });
});
