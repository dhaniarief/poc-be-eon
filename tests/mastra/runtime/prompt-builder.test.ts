import { describe, expect, it } from "vitest";
import { buildAgentPrompt } from "../../../src/mastra/runtime/prompt-builder.js";

describe("buildAgentPrompt", () => {
  it("returns plain user text when no host entity context exists", () => {
    expect(buildAgentPrompt({ message: "Ringkas OP001" })).toBe("Ringkas OP001");
  });

  it("supports generic host entity context without active-opportunity state", () => {
    const prompt = buildAgentPrompt({
      message: "Ringkas record ini",
      entities: {
        opportunity: {
          id: "59cf2a22-6281-4465-9232-8ebeab009e5e",
          name: "OP001",
        },
        vendor: { id: "vendor-1", name: "Vendor A" },
      },
    });

    expect(prompt).toContain("HOST-SUPPLIED ENTITY CONTEXT");
    expect(prompt).toContain("opportunity: OP001");
    expect(prompt).toContain("vendor: Vendor A");
    expect(prompt).not.toContain("active opportunity");
  });
});
