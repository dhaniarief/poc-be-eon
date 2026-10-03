import { finopsGetAll } from "./finops-client.js";
import { resolveFinOpsItem } from "./item-resolver.service.js";
import { escapeODataString } from "../../../utils/odata.util.js";
import { normalizeText } from "../../../utils/text.util.js";

export type StockVariantInput = {
  uomId?: string | null;
  uomName: string;
};

export type StockVariant = {
  status: string;
  uomId: string | null;
  uomName: string;
  finopsProductName: string;
  productNumber: string | null;
  itemId: string | null;
  sites: Array<{ site: string; available: number }>;
};

export type SalesOrderHeader = {
  opportunityNo: string;
  salesOrderNumber: string;
  customerOrderReference: string;
  status: string;
  processingStatus: string;
  name: string;
  customerRequisitionNumber: string;
  customerAccount: string;
  currency: string;
  createdAt: string | null;
  site: string;
  warehouse: string;
  specialInstruction: string;
  lineAmount: number;
};

export type SalesOrderLine = {
  salesOrderNumber: string;
  itemId: string;
  productName: string;
  uom: string;
  quantity: number;
  lineAmount: number;
  salesPrice: number;
  status: string;
  currency: string;
};

export type DeliveryHeader = {
  salesOrderNumber: string;
  packingSlipId: string;
  internalPackingSlipId: string;
  customerReference: string;
  purchaseOrder: string;
  deliveryDate: string | null;
  receiptDate: string | null;
  quantity: number;
  warehouse: string;
  received: string;
  invoiceAccount: string;
  deliveryName: string;
  transporter: string;
  invoiceAmount: number;
};

export type DeliveryLine = {
  salesOrderNumber: string;
  packingSlipId: string;
  itemId: string;
  productName: string;
  uom: string;
  quantity: number;
  value: number;
  deliveryDate: string | null;
};

export type InvoiceHeader = {
  invoiceNumber: string;
  invoiceDate: string | null;
  salesOrderNumber: string;
  customerReference: string;
  customerAccount: string;
  currency: string;
  paymentTerms: string;
  invoiceAmount: number;
  taxAmount: number;
  discountAmount: number;
  chargeAmount: number;
};

export type InvoiceLine = {
  invoiceNumber: string;
  invoiceDate: string | null;
  productNumber: string;
  productName: string;
  uom: string;
  quantity: number;
  lineAmount: number;
  currency: string;
};

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function chunks<T>(values: T[], size = 20) {
  const result: T[][] = [];
  for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size));
  return result;
}

function sanitizeSpecialInstruction(value: string) {
  return value
    .replace(/(password|passwd|pwd|pasw)\s*[:=]?\s*[^\s<>\r\n]+/gi, "$1: [REDACTED]")
    .replace(/(user(?:name)?)\s*[:=]?\s*[^\s<>\r\n]+/gi, "$1: [REDACTED]");
}

function matchOpportunityNo(reference: string, opportunityNos: string[]) {
  const clean = normalizeText(reference).toUpperCase();
  return (
    opportunityNos.find((noOpp) => clean.startsWith(noOpp.toUpperCase())) ?? ""
  );
}

export async function getStockByItemIds(itemIds: string[], warehouse?: string) {
  const ids = unique(itemIds);
  if (ids.length === 0) return [];

  const allRows: Array<{
    ItemNumber?: string;
    ProductName?: string;
    InventorySiteId?: string;
    AvailableOnHandQuantity?: number;
  }> = [];

  for (const batch of chunks(ids, 25)) {
    const itemFilter = batch
      .map((id) => `ItemNumber eq '${escapeODataString(id)}'`)
      .join(" or ");
    const siteFilter = warehouse
      ? ` and InventorySiteId eq '${escapeODataString(warehouse)}'`
      : "";

    allRows.push(
      ...(await finopsGetAll<{
        ItemNumber?: string;
        ProductName?: string;
        InventorySiteId?: string;
        AvailableOnHandQuantity?: number;
      }>("InventorySitesOnHandV2", {
        $select: "ItemNumber,ProductName,InventorySiteId,AvailableOnHandQuantity",
        $filter: `(${itemFilter})${siteFilter}`,
      })),
    );
  }

  return allRows.map((row) => ({
    itemId: normalizeText(row.ItemNumber),
    productName: normalizeText(row.ProductName),
    site: normalizeText(row.InventorySiteId),
    available: Number(row.AvailableOnHandQuantity ?? 0),
  }));
}

export async function resolveProductStock(input: {
  productName: string;
  variants: StockVariantInput[];
  warehouse?: string;
}) {
  const variants = input.variants.filter((item) => normalizeText(item.uomName));

  const resolutions = await Promise.all(
    variants.map(async (variant) => ({
      variant,
      resolution: await resolveFinOpsItem(input.productName, variant.uomName),
    })),
  );

  const itemIds = unique(
    resolutions
      .map((item) => item.resolution.itemNumber ?? "")
      .filter(Boolean),
  );
  const inventory = await getStockByItemIds(itemIds, input.warehouse);

  const output: StockVariant[] = resolutions.map(({ variant, resolution }) => ({
    status: resolution.status,
    uomId: variant.uomId ?? null,
    uomName: variant.uomName,
    finopsProductName: resolution.finopsProductName,
    productNumber: resolution.productNumber,
    itemId: resolution.itemNumber,
    sites: resolution.itemNumber
      ? inventory
          .filter((row) => row.itemId === resolution.itemNumber)
          .map((row) => ({ site: row.site, available: row.available }))
      : [],
  }));

  return {
    productName: normalizeText(input.productName),
    warehouse: input.warehouse ?? null,
    variants: output,
    summary: {
      attempted: output.length,
      resolved: output.filter((item) => item.status === "RESOLVED").length,
      unresolved: output.filter((item) => item.status !== "RESOLVED").length,
    },
  };
}

export async function getDirectItemStock(itemId: string, warehouse?: string) {
  const inventory = await getStockByItemIds([itemId], warehouse);
  return {
    itemId,
    warehouse: warehouse ?? null,
    sites: inventory.map((row) => ({
      site: row.site,
      available: row.available,
      productName: row.productName,
    })),
  };
}

async function getSalesOrderHeaders(opportunityNos: string[]) {
  const nos = unique(opportunityNos);
  const rows: any[] = [];

  for (const batch of chunks(nos, 15)) {
    // Keep EON's working literal-star convention exactly as requested.
    const refs = batch
      .map(
        (noOpp) =>
          `CustomersOrderReference eq '${escapeODataString(noOpp)}*'`,
      )
      .join(" or ");

    rows.push(
      ...(await finopsGetAll("SalesOrderHeadersV2", {
        $select: [
          "SalesOrderNumber",
          "CustomersOrderReference",
          "SalesOrderStatus",
          "SalesOrderProcessingStatus",
          "SalesOrderName",
          "CustomerRequisitionNumber",
          "OrderingCustomerAccountNumber",
          "CurrencyCode",
          "OrderCreationDateTime",
          "DefaultShippingSiteId",
          "DefaultShippingWarehouseId",
          "TS_SpecialInstruction",
        ].join(","),
        $filter: `dataAreaId eq 'ecp' and (${refs})`,
      })),
    );
  }

  const seen = new Set<string>();
  return rows
    .map((row) => ({
      opportunityNo: matchOpportunityNo(row.CustomersOrderReference ?? "", nos),
      salesOrderNumber: normalizeText(row.SalesOrderNumber),
      customerOrderReference: normalizeText(row.CustomersOrderReference),
      status: normalizeText(row.SalesOrderStatus),
      processingStatus: normalizeText(row.SalesOrderProcessingStatus),
      name: normalizeText(row.SalesOrderName),
      customerRequisitionNumber: normalizeText(row.CustomerRequisitionNumber),
      customerAccount: normalizeText(row.OrderingCustomerAccountNumber),
      currency: normalizeText(row.CurrencyCode),
      createdAt: row.OrderCreationDateTime ?? null,
      site: normalizeText(row.DefaultShippingSiteId),
      warehouse: normalizeText(row.DefaultShippingWarehouseId),
      specialInstruction: sanitizeSpecialInstruction(
        normalizeText(row.TS_SpecialInstruction),
      ),
      lineAmount: 0,
    }))
    .filter((row) => {
      if (!row.salesOrderNumber || seen.has(row.salesOrderNumber)) return false;
      seen.add(row.salesOrderNumber);
      return true;
    });
}

async function getSalesOrderLines(salesOrderNumbers: string[]) {
  const numbers = unique(salesOrderNumbers);
  const rows: any[] = [];
  for (const batch of chunks(numbers, 20)) {
    const filter = batch
      .map((number) => `SalesOrderNumber eq '${escapeODataString(number)}'`)
      .join(" or ");
    rows.push(
      ...(await finopsGetAll("SalesOrderLinesV3", {
        $select: [
          "SalesOrderNumber",
          "ItemNumber",
          "LineDescription",
          "SalesUnitSymbol",
          "OrderedSalesQuantity",
          "LineAmount",
          "SalesPrice",
          "FulfillmentStatus",
          "CurrencyCode",
        ].join(","),
        $filter: `dataAreaId eq 'ecp' and (${filter})`,
      })),
    );
  }

  return rows.map<SalesOrderLine>((row) => ({
    salesOrderNumber: normalizeText(row.SalesOrderNumber),
    itemId: normalizeText(row.ItemNumber),
    productName: normalizeText(row.LineDescription),
    uom: normalizeText(row.SalesUnitSymbol),
    quantity: Number(row.OrderedSalesQuantity ?? 0),
    lineAmount: Number(row.LineAmount ?? 0),
    salesPrice: Number(row.SalesPrice ?? 0),
    status: normalizeText(row.FulfillmentStatus),
    currency: normalizeText(row.CurrencyCode),
  }));
}

async function getDeliveryHeaders(salesOrderNumbers: string[]) {
  const numbers = unique(salesOrderNumbers);
  const rows: any[] = [];
  for (const batch of chunks(numbers, 20)) {
    const filter = batch
      .map((number) => `SalesId eq '${escapeODataString(number)}'`)
      .join(" or ");
    rows.push(
      ...(await finopsGetAll("TS_CustPackSlipJours", {
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
        $filter: `dataAreaId eq 'ecp' and (${filter})`,
      })),
    );
  }

  const seen = new Set<string>();
  return rows
    .map<DeliveryHeader>((row) => ({
      salesOrderNumber: normalizeText(row.SalesId),
      packingSlipId: normalizeText(row.PackingSlipId),
      internalPackingSlipId: normalizeText(row.InternalPackingSlipId),
      customerReference: normalizeText(row.CustomerRef),
      purchaseOrder: normalizeText(row.PurchaseOrder),
      deliveryDate: row.DeliveryDate ?? null,
      receiptDate: row.TS_ReceiptDate ?? null,
      quantity: Number(row.Qty ?? 0),
      warehouse: normalizeText(row.inventLocationId),
      received: normalizeText(row.TS_Received),
      invoiceAccount: normalizeText(row.InvoiceAccount),
      deliveryName: normalizeText(row.DeliveryName),
      transporter: normalizeText(row.TS_Transporter),
      invoiceAmount: Number(row.TS_InvoiceAmountTmp ?? 0),
    }))
    .filter((row) => {
      if (!row.packingSlipId || seen.has(row.packingSlipId)) return false;
      seen.add(row.packingSlipId);
      return true;
    });
}

async function getDeliveryLines(salesOrderNumbers: string[]) {
  const numbers = unique(salesOrderNumbers);
  const rows: any[] = [];
  for (const batch of chunks(numbers, 20)) {
    const filter = batch
      .map((number) => `SalesId eq '${escapeODataString(number)}'`)
      .join(" or ");
    rows.push(
      ...(await finopsGetAll("CustPackingSlipTransBiEntities", {
        $select: "PackingSlipId,SalesId,ItemId,Name,Qty,SalesUnit,ValueMST,DeliveryDate",
        $filter: `dataAreaId eq 'ecp' and (${filter})`,
      })),
    );
  }
  return rows.map<DeliveryLine>((row) => ({
    salesOrderNumber: normalizeText(row.SalesId),
    packingSlipId: normalizeText(row.PackingSlipId),
    itemId: normalizeText(row.ItemId),
    productName: normalizeText(row.Name),
    uom: normalizeText(row.SalesUnit),
    quantity: Number(row.Qty ?? 0),
    value: Number(row.ValueMST ?? 0),
    deliveryDate: row.DeliveryDate ?? null,
  }));
}

async function getInvoiceHeaders(salesOrderNumbers: string[]) {
  const numbers = unique(salesOrderNumbers);
  const rows: any[] = [];
  for (const batch of chunks(numbers, 20)) {
    const filter = batch
      .map((number) => `SalesOrderNumber eq '${escapeODataString(number)}'`)
      .join(" or ");
    rows.push(
      ...(await finopsGetAll("SalesInvoiceHeadersV2", {
        $select: [
          "InvoiceNumber",
          "InvoiceDate",
          "CurrencyCode",
          "SalesOrderNumber",
          "CustomersOrderReference",
          "InvoiceCustomerAccountNumber",
          "PaymentTermsName",
          "TotalInvoiceAmount",
          "TotalTaxAmount",
          "TotalDiscountAmount",
          "TotalChargeAmount",
        ].join(","),
        $filter: `dataAreaId eq 'ecp' and (${filter})`,
      })),
    );
  }

  const seen = new Set<string>();
  return rows
    .map<InvoiceHeader>((row) => ({
      invoiceNumber: normalizeText(row.InvoiceNumber),
      invoiceDate: row.InvoiceDate ?? null,
      salesOrderNumber: normalizeText(row.SalesOrderNumber),
      customerReference: normalizeText(row.CustomersOrderReference),
      customerAccount: normalizeText(row.InvoiceCustomerAccountNumber),
      currency: normalizeText(row.CurrencyCode),
      paymentTerms: normalizeText(row.PaymentTermsName),
      invoiceAmount: Number(row.TotalInvoiceAmount ?? 0),
      taxAmount: Number(row.TotalTaxAmount ?? 0),
      discountAmount: Number(row.TotalDiscountAmount ?? 0),
      chargeAmount: Number(row.TotalChargeAmount ?? 0),
    }))
    .filter((row) => {
      if (!row.invoiceNumber || seen.has(row.invoiceNumber)) return false;
      seen.add(row.invoiceNumber);
      return true;
    });
}

async function getInvoiceLines(invoiceNumbers: string[]) {
  const numbers = unique(invoiceNumbers);
  const rows: any[] = [];
  for (const batch of chunks(numbers, 20)) {
    const filter = batch
      .map((number) => `InvoiceNumber eq '${escapeODataString(number)}'`)
      .join(" or ");
    rows.push(
      ...(await finopsGetAll("SalesInvoiceLines", {
        $select: [
          "InvoiceNumber",
          "InvoiceDate",
          "ProductNumber",
          "ProductName",
          "SalesUnitSymbol",
          "InvoicedQuantity",
          "LineAmount",
          "CurrencyCode",
        ].join(","),
        $filter: `dataAreaId eq 'ecp' and (${filter})`,
      })),
    );
  }
  return rows.map<InvoiceLine>((row) => ({
    invoiceNumber: normalizeText(row.InvoiceNumber),
    invoiceDate: row.InvoiceDate ?? null,
    productNumber: normalizeText(row.ProductNumber),
    productName: normalizeText(row.ProductName),
    uom: normalizeText(row.SalesUnitSymbol),
    quantity: Number(row.InvoicedQuantity ?? 0),
    lineAmount: Number(row.LineAmount ?? 0),
    currency: normalizeText(row.CurrencyCode),
  }));
}

export async function getOpportunityOperations(opportunityNos: string[]) {
  const nos = unique(opportunityNos.map((item) => normalizeText(item)));
  if (nos.length === 0) {
    return {
      salesOrders: [] as SalesOrderHeader[],
      salesOrderLines: [] as SalesOrderLine[],
      deliveries: [] as DeliveryHeader[],
      deliveryLines: [] as DeliveryLine[],
      invoices: [] as InvoiceHeader[],
      invoiceLines: [] as InvoiceLine[],
    };
  }

  const salesOrders = await getSalesOrderHeaders(nos);
  const salesOrderNumbers = salesOrders.map((row) => row.salesOrderNumber);
  if (salesOrderNumbers.length === 0) {
    return {
      salesOrders,
      salesOrderLines: [],
      deliveries: [],
      deliveryLines: [],
      invoices: [],
      invoiceLines: [],
    };
  }

  const [salesOrderLines, deliveries, deliveryLines, invoices] = await Promise.all([
    getSalesOrderLines(salesOrderNumbers),
    getDeliveryHeaders(salesOrderNumbers),
    getDeliveryLines(salesOrderNumbers),
    getInvoiceHeaders(salesOrderNumbers),
  ]);

  const amountBySalesOrder = new Map<string, number>();
  for (const line of salesOrderLines) {
    amountBySalesOrder.set(
      line.salesOrderNumber,
      (amountBySalesOrder.get(line.salesOrderNumber) ?? 0) + line.lineAmount,
    );
  }
  for (const header of salesOrders) {
    header.lineAmount = amountBySalesOrder.get(header.salesOrderNumber) ?? 0;
  }

  const invoiceLines = await getInvoiceLines(invoices.map((row) => row.invoiceNumber));

  return {
    salesOrders,
    salesOrderLines,
    deliveries,
    deliveryLines,
    invoices,
    invoiceLines,
  };
}
