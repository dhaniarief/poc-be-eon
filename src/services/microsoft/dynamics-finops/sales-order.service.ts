import { finopsGet } from "./finops-client.js";
import { dynamicsGet } from "../dynamics-crm/crm-client.js";
import { escapeODataString } from "../../../utils/odata.util.js";

type CRMOpportunityResponse = {
  value: Array<{
    new_noopp?: string;
  }>;
};

type SalesOrderHeaderResponse = {
  value: Array<{
    SalesOrderNumber?: string;
    CustomersOrderReference?: string;
    SalesOrderStatus?: string;
    SalesOrderProcessingStatus?: string;
    SalesOrderName?: string;
    CustomerRequisitionNumber?: string;
    OrderingCustomerAccountNumber?: string;
    CurrencyCode?: string;
    OrderTotalAmount?: number;
    OrderCreationDateTime?: string;
    RequestedShippingDate?: string;
    RequestedReceiptDate?: string;
    ConfirmedShippingDate?: string;
    ConfirmedReceiptDate?: string;
    DefaultShippingSiteId?: string;
    DefaultShippingWarehouseId?: string;
    TS_SpecialInstruction?: string;
  }>;
};


function sanitizeSpecialInstruction(value: string) {
  return value
    .replace(
      /(password|passwd|pwd|pasw)\s*[:=]?\s*[^\s<>\r\n]+/gi,
      "$1: [REDACTED]",
    )
    .replace(/(user(?:name)?)\s*[:=]?\s*[^\s<>\r\n]+/gi, "$1: [REDACTED]");
}

async function getOpportunityNo(opportunityId: string) {
  const data = await dynamicsGet<CRMOpportunityResponse>(
    `/api/data/v9.2/opportunities` +
      `?$select=new_noopp` +
      `&$filter=opportunityid eq ${opportunityId}`,
  );

  const opportunity = data.value[0];

  if (!opportunity) {
    throw new Error(`Opportunity ${opportunityId} not found`);
  }

  return opportunity.new_noopp ?? "";
}

export async function getSalesOrdersForOpportunity(opportunityId: string) {
  /*
   * 1. Ambil No Opportunity dari CRM
   */

  const noOpp = await getOpportunityNo(opportunityId);

  if (!noOpp) {
    return {
      noOpp: "",
      total: 0,
      salesOrders: [],
    };
  }

  /*
   * 2. Cari SO FinOps berdasarkan
   * CustomersOrderReference.
   */

  const data = await finopsGet<SalesOrderHeaderResponse>(
    "SalesOrderHeadersV2",

    {
      $select: [
        "SalesOrderNumber",
        "CustomersOrderReference",
        "SalesOrderStatus",
        "SalesOrderProcessingStatus",
        "SalesOrderName",
        "CustomerRequisitionNumber",
        "OrderingCustomerAccountNumber",
        "CurrencyCode",
        "OrderTotalAmount",
        "OrderCreationDateTime",
        "RequestedShippingDate",
        "RequestedReceiptDate",
        "ConfirmedShippingDate",
        "ConfirmedReceiptDate",
        "DefaultShippingSiteId",
        "DefaultShippingWarehouseId",
        "TS_SpecialInstruction",
      ].join(","),

      $filter:
        `dataAreaId eq 'ecp' ` + `and CustomersOrderReference eq '${escapeODataString(noOpp)}*'`,
    },
  );

  const salesOrders = data.value.map((row) => ({
    salesOrderNumber: row.SalesOrderNumber ?? "",

    customerOrderReference: row.CustomersOrderReference ?? "",

    status: row.SalesOrderStatus ?? "",

    processingStatus: row.SalesOrderProcessingStatus ?? "",

    salesOrderName: row.SalesOrderName ?? "",

    customerRequisitionNumber: row.CustomerRequisitionNumber ?? "",

    customerAccount: row.OrderingCustomerAccountNumber ?? "",

    currency: row.CurrencyCode ?? "",

    totalAmount: row.OrderTotalAmount ?? 0,

    createdAt: row.OrderCreationDateTime ?? "",

    requestedShippingDate: row.RequestedShippingDate ?? "",

    requestedReceiptDate: row.RequestedReceiptDate ?? "",

    confirmedShippingDate: row.ConfirmedShippingDate ?? "",

    confirmedReceiptDate: row.ConfirmedReceiptDate ?? "",

    site: row.DefaultShippingSiteId ?? "",

    warehouse: row.DefaultShippingWarehouseId ?? "",

    specialInstruction: sanitizeSpecialInstruction(
      row.TS_SpecialInstruction ?? "",
    ),
  }));

  return {
    noOpp,

    total: salesOrders.length,

    salesOrders,
  };
}


export type SalesOrderResult = Awaited<ReturnType<typeof getSalesOrdersForOpportunity>>;
