import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const html = await readFile(new URL("../../public/dev/index.html", import.meta.url), "utf8");

describe("dev playground conversation and metrics", () => {
  it("keeps independent conversation ids for local and cloud", () => {
    expect(html).toContain('const conversations = {');
    expect(html).toContain('local: null');
    expect(html).toContain('cloud: null');
    expect(html).toContain('conversationId: conversations[modelMode] || undefined');
    expect(html).toContain('conversations[modelMode] = data.conversationId');
  });

  it("offers a new conversation action without clearing the opportunity or prompt", () => {
    expect(html).toContain('id="new-conversation"');
    expect(html).toContain('function resetConversations()');
    expect(html).toContain('conversations.local = null');
    expect(html).toContain('conversations.cloud = null');
  });

  it("renders backend metrics for comparison", () => {
    expect(html).toContain('Backend Duration');
    expect(html).toContain('Agent Steps');
    expect(html).toContain('Total Tokens');
    expect(html).toContain('Cached Input Tokens');
    expect(html).toContain('Client Wall Time');
  });
  it("expands the broad intelligence tool into its actual internal source coverage", () => {
    expect(html).toContain("common.get_opportunity_intelligence");
    expect(html).toContain('sources.add("crm")');
    expect(html).toContain('sources.add("finops")');
    expect(html).toContain('sources.add("sharepoint")');
  });

});
