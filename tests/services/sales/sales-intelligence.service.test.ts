import { describe, expect, it } from "vitest";
import { calculateOpportunityRevenue } from "../../../src/services/sales/sales-intelligence.service.js";

function partial(partialId: string, amount: number) {
  return {
    partialId,
    opportunityId: "o1",
    opportunityNo: "OP1",
    ownerId: null,
    productId: null,
    productName: "P1",
    uomId: null,
    uomName: "",
    quantity: 1,
    pricePerUnit: amount,
    amount,
    extendedAmount: amount,
    actualCloseDate: "2026-01-01",
    createdOn: "2026-01-01",
    ppicVerified: null,
    adminVerified: null,
  };
}

describe("calculateOpportunityRevenue", () => {
  it("adds Opportunity actualvalue and partial extended amounts", () => {
    expect(calculateOpportunityRevenue(50, [partial("p1", 20), partial("p2", 30)])).toEqual({
      opportunityActualRevenue: 50,
      partialRevenue: 50,
      partialCount: 2,
      actualRevenue: 100,
    });
  });

  it("counts partial records by distinct history id", () => {
    const result = calculateOpportunityRevenue(0, [
      partial("p1", 20),
      partial("p1", 20),
      partial("p2", 30),
    ]);

    expect(result.partialCount).toBe(2);
  });
});
