import { finopsGet } from "./finops-client.js";
import {
  getSalesOrdersForOpportunity,
  type SalesOrderResult,
} from "./sales-order.service.js";
import { escapeODataString } from "../../../utils/odata.util.js";

type InvoiceResponse = {
  value: Array<{
    dataAreaId?: string;
    InvoiceNumber?: string;
    InvoiceDate?: string;
    LedgerVoucher?: string;
    CurrencyCode?: string;
    SalesOrderNumber?: string;
    CustomersOrderReference?: string;
    InvoiceCustomerAccountNumber?: string;
    PaymentTermsName?: string;
    TotalInvoiceAmount?: number;
    TotalTaxAmount?: number;
    TotalDiscountAmount?: number;
    TotalChargeAmount?: number;
  }>;
};

function mapInvoiceRow(row: InvoiceResponse["value"][number]) {
  return {
    invoiceNumber: row.InvoiceNumber ?? "",
    invoiceDate: row.InvoiceDate ?? "",
    ledgerVoucher: row.LedgerVoucher ?? "",
    salesOrderNumber: row.SalesOrderNumber ?? "",
    customerReference: row.CustomersOrderReference ?? "",
    customerAccount: row.InvoiceCustomerAccountNumber ?? "",
    currency: row.CurrencyCode ?? "",
    paymentTerms: row.PaymentTermsName ?? "",
    invoiceAmount: row.TotalInvoiceAmount ?? 0,
    taxAmount: row.TotalTaxAmount ?? 0,
    discountAmount: row.TotalDiscountAmount ?? 0,
    chargeAmount: row.TotalChargeAmount ?? 0,
  };
}

export async function getInvoicesFromSalesOrders(
  salesOrderResult: SalesOrderResult,
) {
  const salesOrderNumbers = salesOrderResult.salesOrders
    .map((item) => item.salesOrderNumber)
    .filter(Boolean);

  if (salesOrderNumbers.length === 0) {
    return {
      noOpp: salesOrderResult.noOpp,
      totalSalesOrders: 0,
      totalInvoices: 0,
      totalInvoiceAmount: 0,
      invoices: [],
    };
  }

  const salesOrderFilter = salesOrderNumbers
    .map((number) => `SalesOrderNumber eq '${escapeODataString(number)}'`)
    .join(" or ");

  const data = await finopsGet<InvoiceResponse>("SalesInvoiceHeadersV2", {
    $select: [
      "InvoiceNumber",
      "InvoiceDate",
      "LedgerVoucher",
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
    $filter: `dataAreaId eq 'ecp' and (${salesOrderFilter})`,
  });

  const invoices = data.value.map(mapInvoiceRow);

  return {
    noOpp: salesOrderResult.noOpp,
    totalSalesOrders: salesOrderNumbers.length,
    totalInvoices: invoices.length,
    totalInvoiceAmount: invoices.reduce(
      (sum, item) => sum + item.invoiceAmount,
      0,
    ),
    invoices,
  };
}

export async function getInvoicesForOpportunity(opportunityId: string) {
  return getInvoicesFromSalesOrders(
    await getSalesOrdersForOpportunity(opportunityId),
  );
}
