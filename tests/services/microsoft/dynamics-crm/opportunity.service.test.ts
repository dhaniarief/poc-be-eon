import { describe, expect, it } from "vitest";
import {
  getOpportunityActivities,
  getOpportunityOverview,
  getOpportunityProducts,
  getOpportunityStage,
} from "../../../../src/services/microsoft/dynamics-crm/opportunity.service.js";

const OPPORTUNITY_ID = "59cf2a22-6281-4465-9232-8ebeab009e5e";

describe("opportunity CRM service", () => {
  it("maps overview", async () => {
    const fakeGet = async () => ({
      value: [
        {
          opportunityid: OPPORTUNITY_ID,
          name: "Test Opp",
          new_noopp: "OP001",
          "_customerid_value@OData.Community.Display.V1.FormattedValue": "Customer A",
          "_ownerid_value@OData.Community.Display.V1.FormattedValue": "Owner A",
          "statuscode@OData.Community.Display.V1.FormattedValue": "Won",
          "new_warehouse@OData.Community.Display.V1.FormattedValue": "PTM",
          "new_productfamily2@OData.Community.Display.V1.FormattedValue": "Oil Production Chemicals",
        },
      ],
    });

    const result = await getOpportunityOverview(OPPORTUNITY_ID, fakeGet as any);
    expect(result.noOpp).toBe("OP001");
    expect(result.customer).toBe("Customer A");
    expect(result.warehouse).toBe("PTM");
  });

  it("maps products", async () => {
    const result = await getOpportunityProducts(
      OPPORTUNITY_ID,
      (async () => ({
        value: [
          {
            productname: "P1",
            quantity: 2,
            new_uom: "Drum",
            priceperunit: 10,
            extendedamount: 20,
            new_disc: 1,
          },
        ],
      })) as any,
    );
    expect(result.products[0]).toEqual({
      name: "P1",
      quantity: 2,
      uom: "Drum",
      price: 10,
      amount: 20,
      discount: 1,
    });
  });

  it("maps activities", async () => {
    const result = await getOpportunityActivities(
      OPPORTUNITY_ID,
      (async () => ({
        value: [
          {
            subject: "Follow up",
            scheduledstart: "2026-01-01",
            "statecode@OData.Community.Display.V1.FormattedValue": "Open",
            "_ownerid_value@OData.Community.Display.V1.FormattedValue": "Owner A",
          },
        ],
      })) as any,
    );
    expect(result.activities[0]).toEqual({
      subject: "Follow up",
      owner: "Owner A",
      status: "Open",
      startDate: "2026-01-01",
    });
  });

  it("maps stage and readiness", async () => {
    const result = await getOpportunityStage(
      OPPORTUNITY_ID,
      (async () => ({
        value: [
          {
            opportunityid: OPPORTUNITY_ID,
            new_noopp: "OP001",
            name: "Test",
            "new_opstages@OData.Community.Display.V1.FormattedValue": "4-Close",
            "statuscode@OData.Community.Display.V1.FormattedValue": "Won",
            new_purchasedorder: true,
          },
        ],
      })) as any,
    );
    expect(result.process.opportunityStage).toBe("4-Close");
    expect(result.status.status).toBe("Won");
    expect(result.orderReadiness.purchaseOrder).toBe("Yes");
  });
});
