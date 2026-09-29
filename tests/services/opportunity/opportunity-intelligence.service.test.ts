import { describe, expect, it, vi } from "vitest";
import { getOpportunityIntelligence } from "../../../src/services/opportunity/opportunity-intelligence.service.js";

const OPPORTUNITY_ID = "59cf2a22-6281-4465-9232-8ebeab009e5e";

function createDeps() {
  return {
    getOverview: vi.fn(async () => ({
      opportunityId: OPPORTUNITY_ID,
      opportunityName: "Opp",
      noOpp: "OP1",
      customer: "Customer",
      owner: "Owner",
      status: "Won",
      warehouse: "PTM",
      destination: "",
      productFamily: "Oil Production Chemicals",
      forecastCategory: "Won",
    })),
    getProducts: vi.fn(async () => ({
      products: [
        {
          name: "P1",
          quantity: 2,
          uom: "Drum",
          price: 10,
          amount: 20,
          discount: 0,
        },
      ],
    })),
    getActivities: vi.fn(async () => ({ activities: [] })),
    getStage: vi.fn(async () => ({
      opportunityId: OPPORTUNITY_ID,
      noOpp: "OP1",
      name: "Opp",
      status: { state: "Open", status: "Won", forecastCategory: "Won" },
      process: {
        stepName: "Closing",
        opportunityStage: "4-Close",
        salesStage: "",
        salesStageCode: "",
      },
      orderReadiness: {
        purchaseOrder: "Yes",
        salesCoordinatorVerified: "Yes",
        adminVerified: "Yes",
        ppicStatus: "",
        ppicNote: "",
      },
    })),
    getResolvedItems: vi.fn(async () => ({
      opportunityId: OPPORTUNITY_ID,
      items: [
        {
          status: "RESOLVED",
          productName: "P1",
          uom: "Drum",
          requestedQuantity: 2,
          itemNumber: "FG1",
          productNumber: "PR1",
          finopsProductName: "P1 Drum",
          opportunityProductId: "1",
        },
      ],
      summary: { total: 1, resolved: 1, unresolved: 0 },
    })),
    checkStock: vi.fn(async () => ({
      warehouse: "PTM",
      summary: { total: 1, sufficient: 0, shortage: 1, unresolved: 0 },
      items: [
        {
          status: "RESOLVED",
          productName: "P1",
          uom: "Drum",
          finopsProductName: "P1 Drum",
          productNumber: "PR1",
          itemNumber: "FG1",
          opportunityProductId: "1",
          requestedQuantity: 2,
          warehouse: "PTM",
          available: 0,
          stockStatus: "SHORTAGE",
        },
      ],
    })),
    getSalesOrders: vi.fn(async () => ({
      noOpp: "OP1",
      total: 1,
      salesOrders: [
        {
          salesOrderNumber: "SO1",
          customerOrderReference: "OP1*",
          status: "Invoiced",
          processingStatus: "",
          salesOrderName: "",
          customerRequisitionNumber: "",
          customerAccount: "1001",
          currency: "IDR",
          totalAmount: 20,
          createdAt: "",
          requestedShippingDate: "",
          requestedReceiptDate: "",
          confirmedShippingDate: "",
          confirmedReceiptDate: "",
          site: "PTM",
          warehouse: "PTM",
          specialInstruction: "",
        },
      ],
    })),
    getDeliveryFromSalesOrders: vi.fn(async () => ({
      noOpp: "OP1",
      totalSalesOrders: 1,
      totalDeliveries: 1,
      deliveries: [
        {
          salesOrderNumber: "SO1",
          packingSlipId: "DO1",
          internalPackingSlipId: "",
          customerReference: "",
          purchaseOrder: "",
          deliveryDate: "2024-06-12",
          receiptDate: "2024-06-12",
          quantity: 2,
          warehouse: "DURI",
          received: "Yes",
          invoiceAccount: "",
          deliveryName: "",
          transporter: "",
          invoiceAmount: 0,
        },
      ],
    })),
    getInvoicesFromSalesOrders: vi.fn(async () => ({
      noOpp: "OP1",
      totalSalesOrders: 1,
      totalInvoices: 1,
      totalInvoiceAmount: 22,
      invoices: [
        {
          invoiceNumber: "INV1",
          invoiceDate: "2024-06-12",
          ledgerVoucher: "",
          salesOrderNumber: "SO1",
          customerReference: "",
          customerAccount: "1001",
          currency: "IDR",
          paymentTerms: "N30",
          invoiceAmount: 22,
          taxAmount: 2,
          discountAmount: 0,
          chargeAmount: 0,
        },
      ],
    })),
    getMsdsFromResolvedItems: vi.fn(async () => ({
      opportunityId: OPPORTUNITY_ID,
      summary: {
        totalProducts: 1,
        msdsFound: 1,
        msdsNotFound: 0,
        itemNotFound: 0,
      },
      products: [
        {
          productName: "P1",
          uom: "Drum",
          quantity: 2,
          productNumber: "PR1",
          itemNumber: "FG1",
          mappingStatus: "RESOLVED",
          msdsFound: true,
          totalDocuments: 2,
          status: "FOUND",
          documents: [],
        },
      ],
    })),
  };
}

describe("getOpportunityIntelligence", () => {
  it("reuses resolved items and sales orders and never adds route data", async () => {
    const deps = createDeps();
    const result = await getOpportunityIntelligence(OPPORTUNITY_ID, deps as any);

    expect(result.stock.status).toBe("available");
    expect(result.stock.data?.summary.shortage).toBe(1);
    expect(result.msds.data?.products[0]).toEqual({
      productName: "P1",
      msdsFound: true,
      totalDocuments: 2,
    });
    expect((result as any).route).toBeUndefined();
    expect(deps.getResolvedItems).toHaveBeenCalledTimes(1);
    expect(deps.getSalesOrders).toHaveBeenCalledTimes(1);
  });

  it("keeps successful sections when one downstream source fails", async () => {
    const deps = createDeps();
    deps.getInvoicesFromSalesOrders.mockRejectedValueOnce(
      new Error("invoice unavailable"),
    );

    const result = await getOpportunityIntelligence(OPPORTUNITY_ID, deps as any);

    expect(result.stock.status).toBe("available");
    expect(result.invoices.status).toBe("failed");
    expect(result.invoices.reason).toContain("invoice unavailable");
    expect(result.deliveries.status).toBe("available");
  });
});
