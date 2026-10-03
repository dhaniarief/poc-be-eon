import { describe, expect, it } from "vitest";

import { salesAgentInstructions } from "../../../src/mastra/prompts/sales.instructions.js";

describe("salesAgentInstructions", () => {
  it("uses IDs after entity resolution and owner id for salesman Opportunity queries", () => {
    expect(salesAgentInstructions).toContain("systemuserid");

    expect(salesAgentInstructions).toContain("_ownerid_value = systemuserid");

    expect(salesAgentInstructions).toContain("accountid");

    expect(salesAgentInstructions).toContain("productid");
  });

  it("preserves EON stock and transaction mapping rules", () => {
    expect(salesAgentInstructions).toContain("CRM Product Name");

    expect(salesAgentInstructions).toContain("CRM UOM Name");

    expect(salesAgentInstructions).toContain("ProductsV2.ProductNumber");

    expect(salesAgentInstructions).toContain("ReleasedProductsV2.ItemNumber");

    expect(salesAgentInstructions).toContain("InventorySitesOnHandV2");

    expect(salesAgentInstructions).toContain("new_noopp*");

    expect(salesAgentInstructions).toContain('Category = "MSDS for Email"');
  });

  it("documents partial revenue and count rules", () => {
    expect(salesAgentInstructions).toContain("CRM Opportunity actualvalue");

    expect(salesAgentInstructions).toContain(
      "SUM(new_opportunityhistorypartials.new_extendedamount)",
    );

    expect(salesAgentInstructions).toContain(
      "DISTINCT new_opportunityhistorypartialid",
    );

    expect(salesAgentInstructions).toContain("new_actualclosedatepartial");
  });
});
