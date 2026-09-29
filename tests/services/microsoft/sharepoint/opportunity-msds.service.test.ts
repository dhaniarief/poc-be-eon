import { describe, expect, it, vi } from "vitest";
import { getOpportunityMsdsFromResolvedItems } from "../../../../src/services/microsoft/sharepoint/opportunity-msds.service.js";

const items = ["FG1", "FG2", "FG3"].map((itemNumber, index) => ({
  status: "RESOLVED" as const,
  productName: `P${index + 1}`,
  uom: "Drum",
  requestedQuantity: 1,
  productNumber: `PR${index + 1}`,
  itemNumber,
  finopsProductName: `P${index + 1}`,
  opportunityProductId: String(index + 1),
}));

describe("getOpportunityMsdsFromResolvedItems", () => {
  it("loads all resolved item MSDS metadata in one batch and preserves product order", async () => {
    const findMsdsBatch = vi.fn(async () => ({
      FG1: { found: true, itemNumber: "FG1", totalDocuments: 1, documents: [] },
      FG2: { found: false, itemNumber: "FG2", totalDocuments: 0, documents: [] },
      FG3: { found: true, itemNumber: "FG3", totalDocuments: 2, documents: [] },
    }));

    const result = await getOpportunityMsdsFromResolvedItems("opp-1", items, {
      findMsdsBatch,
    });

    expect(findMsdsBatch).toHaveBeenCalledTimes(1);
    expect(findMsdsBatch).toHaveBeenCalledWith(["FG1", "FG2", "FG3"]);
    expect(result.products.map((item) => item.itemNumber)).toEqual(["FG1", "FG2", "FG3"]);
    expect(result.summary).toEqual({
      totalProducts: 3,
      msdsFound: 2,
      msdsNotFound: 1,
      itemNotFound: 0,
    });
  });
});
