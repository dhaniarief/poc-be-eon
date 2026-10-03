import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const html = await readFile(new URL("../../public/dev/index.html", import.meta.url), "utf8");

describe("dev playground", () => {
  it("keeps independent conversations for local and cloud", () => {
    expect(html).toContain("const conversations = {");
    expect(html).toContain("local: null");
    expect(html).toContain("cloud: null");
  });

  it("sends optional Opportunity ID as generic entity context", () => {
    expect(html).toContain("context.entities = {");
    expect(html).toContain("opportunity: { id: opportunityId }");
    expect(html).not.toContain("context.opportunityId = opportunityId");
  });

  it("understands broad Sales tools as multi-source", () => {
    expect(html).toContain("sales.get_opportunity");
    expect(html).toContain("sales.query");
    expect(html).toContain("sales.check_stock");
  });
});
