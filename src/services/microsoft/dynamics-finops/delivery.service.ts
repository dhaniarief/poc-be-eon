import { finopsGet } from "./finops-client.js";
import {
  getSalesOrdersForOpportunity,
  type SalesOrderResult,
} from "./sales-order.service.js";
import { escapeODataString } from "../../../utils/odata.util.js";

type DeliveryResponse = {
  value: Array<{
    dataAreaId?: string;
    PackingSlipId?: string;
    DeliveryDate?: string;
    TS_ReceiptDate?: string;
    InvoiceAccount?: string;
    PurchaseOrder?: string;
    Qty?: number;
    InternalPackingSlipId?: string;
    inventLocationId?: string;
    TS_Transporter?: string;
    TS_Received?: string;
    CustomerRef?: string;
    SalesId?: string;
    TS_InvoiceAmountTmp?: number;
    DeliveryName?: string;
  }>;
};

function mapDeliveryRow(row: DeliveryResponse["value"][number]) {
  return {
    salesOrderNumber: row.SalesId ?? "",
    packingSlipId: row.PackingSlipId ?? "",
    internalPackingSlipId: row.InternalPackingSlipId ?? "",
    customerReference: row.CustomerRef ?? "",
    purchaseOrder: row.PurchaseOrder ?? "",
    deliveryDate: row.DeliveryDate ?? "",
    receiptDate: row.TS_ReceiptDate ?? "",
    quantity: row.Qty ?? 0,
    warehouse: row.inventLocationId ?? "",
    received: row.TS_Received ?? "",
    invoiceAccount: row.InvoiceAccount ?? "",
    deliveryName: row.DeliveryName ?? "",
    transporter: row.TS_Transporter ?? "",
    invoiceAmount: row.TS_InvoiceAmountTmp ?? 0,
  };
}

export async function getDeliveryStatusFromSalesOrders(
  salesOrderResult: SalesOrderResult,
) {
  const salesOrderNumbers = salesOrderResult.salesOrders
    .map((item) => item.salesOrderNumber)
    .filter(Boolean);

  if (salesOrderNumbers.length === 0) {
    return {
      noOpp: salesOrderResult.noOpp,
      totalSalesOrders: 0,
      totalDeliveries: 0,
      deliveries: [],
    };
  }

  const salesOrderFilter = salesOrderNumbers
    .map((number) => `SalesId eq '${escapeODataString(number)}'`)
    .join(" or ");

  const data = await finopsGet<DeliveryResponse>("TS_CustPackSlipJours", {
    $select: [
      "PackingSlipId",
      "InternalPackingSlipId",
      "SalesId",
      "CustomerRef",
      "PurchaseOrder",
      "DeliveryDate",
      "TS_ReceiptDate",
      "Qty",
      "inventLocationId",
      "TS_Received",
      "InvoiceAccount",
      "DeliveryName",
      "TS_Transporter",
      "TS_InvoiceAmountTmp",
    ].join(","),
    $filter: `dataAreaId eq 'ecp' and (${salesOrderFilter})`,
  });

  const deliveries = data.value.map(mapDeliveryRow);

  return {
    noOpp: salesOrderResult.noOpp,
    totalSalesOrders: salesOrderNumbers.length,
    totalDeliveries: deliveries.length,
    deliveries,
  };
}

export async function getDeliveryStatusForOpportunity(opportunityId: string) {
  return getDeliveryStatusFromSalesOrders(
    await getSalesOrdersForOpportunity(opportunityId),
  );
}
