import { describe, expect, it } from "vitest";
import { mapOpportunityProductsWithResolver } from "../../../../src/services/microsoft/dynamics-finops/opportunity-item.service.js";

describe("mapOpportunityProductsWithResolver", () => {
  it("keeps CRM quantity while attaching FinOps identifiers", async () => {
    const result = await mapOpportunityProductsWithResolver(
      [
        {
          opportunityproductid: "line-1",
          productname: "EONBREAK DM 4497",
          new_uom: "Drum",
          quantity: 2,
        },
      ],
      async (productName, uom) => ({
        status: "RESOLVED",
        productName,
        uom,
        finopsProductName: `${productName} ${uom}`,
        productNumber: "P-001",
        itemNumber: "FG02663",
      }),
    );

    expect(result).toEqual([
      {
        status: "RESOLVED",
        productName: "EONBREAK DM 4497",
        uom: "Drum",
        finopsProductName: "EONBREAK DM 4497 Drum",
        productNumber: "P-001",
        itemNumber: "FG02663",
        opportunityProductId: "line-1",
        requestedQuantity: 2,
      },
    ]);
  });
});
