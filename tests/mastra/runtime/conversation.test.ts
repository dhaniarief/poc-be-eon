import { describe, expect, it } from "vitest";
import { resolveConversationIdentity } from "../../../src/mastra/runtime/conversation.js";

describe("resolveConversationIdentity", () => {
  it("creates a conversation id when none is supplied", () => {
    const result = resolveConversationIdentity({ userId: "user-1" });
    expect(result.conversationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(result.threadId).toBe(result.conversationId);
    expect(result.resourceId).toBe("user-1");
  });

  it("reuses an existing conversation id", () => {
    const result = resolveConversationIdentity({
      userId: "user-1",
      conversationId: "conv-sales-001",
    });
    expect(result).toEqual({
      conversationId: "conv-sales-001",
      threadId: "conv-sales-001",
      resourceId: "user-1",
    });
  });

  it("uses legacy threadId only as a migration fallback", () => {
    const result = resolveConversationIdentity({
      userId: "user-1",
      legacyThreadId: "legacy-thread",
    });
    expect(result.conversationId).toBe("legacy-thread");
    expect(result.resourceId).toBe("user-1");
  });

  it("rejects missing authenticated user", () => {
    expect(() => resolveConversationIdentity({})).toThrow(
      "Authenticated user is required",
    );
  });
});
