import { beforeEach, describe, expect, it, vi } from "vitest";

const { runAgent } = vi.hoisted(() => ({ runAgent: vi.fn() }));
vi.mock("../../src/mastra/runtime/agent.runner.js", () => ({ runAgent }));

import { chatAgent } from "../../src/controllers/agent.controller.js";

describe("chatAgent", () => {
  beforeEach(() => runAgent.mockReset());

  it("derives memory resource from authenticated user and passes generic entity context", async () => {
    runAgent.mockResolvedValue({
      text: "ok",
      toolsUsed: [],
      metrics: {},
      conversationId: "conv-1",
    });

    const req = {
      params: { agentId: "sales" },
      body: {
        message: "hello",
        modelMode: "local",
        conversationId: "conv-1",
        resourceId: "attacker-user",
        context: {
          entities: {
            opportunity: { id: "59cf2a22-6281-4465-9232-8ebeab009e5e" },
          },
        },
      },
      user: { userId: "real-user" },
      requestId: "req-1",
    } as any;

    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    await chatAgent(req, { status } as any);

    expect(runAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        threadId: "conv-1",
        resourceId: "real-user",
        context: req.body.context,
      }),
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "conv-1" }),
    );
  });
});
