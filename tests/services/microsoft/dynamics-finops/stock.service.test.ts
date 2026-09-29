import { describe, expect, it, vi } from "vitest";
import { checkOpportunityStockFromResolvedItems } from "../../../../src/services/microsoft/dynamics-finops/stock.service.js";

const OPPORTUNITY_ID = "59cf2a22-6281-4465-9232-8ebeab009e5e";

function resolved(productName: string, itemNumber: string, requestedQuantity: number) {
  return {
    status: "RESOLVED" as const,
    productName,
    uom: "Drum",
    requestedQuantity,
    itemNumber,
    productNumber: `P-${itemNumber}`,
    finopsProductName: productName,
    opportunityProductId: itemNumber,
  };
}

describe("checkOpportunityStockFromResolvedItems", () => {
  it("loads all resolved item inventory in one batch", async () => {
    const getInventory = vi.fn(async () => [
      { ItemNumber: "FG1", AvailableOnHandQuantity: 5 },
      { ItemNumber: "FG2", AvailableOnHandQuantity: 0 },
    ]);

    const result = await checkOpportunityStockFromResolvedItems(
      OPPORTUNITY_ID,
      [resolved("P1", "FG1", 5), resolved("P2", "FG2", 2)],
      {
        getWarehouse: async () => "PTM",
        getInventory,
      },
    );

    expect(getInventory).toHaveBeenCalledTimes(1);
    expect(getInventory).toHaveBeenCalledWith(["FG1", "FG2"], "PTM");
    expect(result.summary).toEqual({
      total: 2,
      sufficient: 1,
      shortage: 1,
      unresolved: 0,
    });
  });

  it("still treats a valid resolved item with no inventory row as zero stock", async () => {
    const result = await checkOpportunityStockFromResolvedItems(
      OPPORTUNITY_ID,
      [resolved("P1", "FG1", 1)],
      {
        getWarehouse: async () => "PTM",
        getInventory: async () => [],
      },
    );

    expect(result.items[0].available).toBe(0);
    expect(result.items[0].stockStatus).toBe("SHORTAGE");
  });
});
