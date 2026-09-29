import {
  getOpportunityActivities,
  getOpportunityOverview,
  getOpportunityProducts,
  getOpportunityStage,
} from "../microsoft/dynamics-crm/opportunity.service.js";
import { getResolvedOpportunityItems } from "../microsoft/dynamics-finops/opportunity-item.service.js";
import { checkOpportunityStockFromResolvedItems } from "../microsoft/dynamics-finops/stock.service.js";
import { getSalesOrdersForOpportunity } from "../microsoft/dynamics-finops/sales-order.service.js";
import { getDeliveryStatusFromSalesOrders } from "../microsoft/dynamics-finops/delivery.service.js";
import { getInvoicesFromSalesOrders } from "../microsoft/dynamics-finops/invoice.service.js";
import { getOpportunityMsdsFromResolvedItems } from "../microsoft/sharepoint/opportunity-msds.service.js";
import {
  available,
  empty,
  failed,
  safeReason,
  type DataSection,
} from "../../utils/result.util.js";
import type { OpportunityIntelligence } from "../../mastra/schemas/opportunity-intelligence.schema.js";

type Dependencies = {
  getOverview: typeof getOpportunityOverview;
  getProducts: typeof getOpportunityProducts;
  getActivities: typeof getOpportunityActivities;
  getStage: typeof getOpportunityStage;
  getResolvedItems: typeof getResolvedOpportunityItems;
  checkStock: typeof checkOpportunityStockFromResolvedItems;
  getSalesOrders: typeof getSalesOrdersForOpportunity;
  getDeliveryFromSalesOrders: typeof getDeliveryStatusFromSalesOrders;
  getInvoicesFromSalesOrders: typeof getInvoicesFromSalesOrders;
  getMsdsFromResolvedItems: typeof getOpportunityMsdsFromResolvedItems;
};

const defaultDeps: Dependencies = {
  getOverview: getOpportunityOverview,
  getProducts: getOpportunityProducts,
  getActivities: getOpportunityActivities,
  getStage: getOpportunityStage,
  getResolvedItems: getResolvedOpportunityItems,
  checkStock: checkOpportunityStockFromResolvedItems,
  getSalesOrders: getSalesOrdersForOpportunity,
  getDeliveryFromSalesOrders: getDeliveryStatusFromSalesOrders,
  getInvoicesFromSalesOrders: getInvoicesFromSalesOrders,
  getMsdsFromResolvedItems: getOpportunityMsdsFromResolvedItems,
};

function settledSection<T, R>(
  result: PromiseSettledResult<T>,
  project: (value: T) => R,
  isEmpty: (value: T) => boolean = () => false,
): DataSection<R> {
  if (result.status === "rejected") {
    return failed(safeReason(result.reason));
  }

  const data = project(result.value);
  return isEmpty(result.value) ? empty(data) : available(data);
}

export async function getOpportunityIntelligence(
  opportunityId: string,
  deps: Dependencies = defaultDeps,
) {
  const [overviewResult, productsResult, activitiesResult, stageResult, resolvedResult, salesOrdersResult] =
    await Promise.allSettled([
      deps.getOverview(opportunityId),
      deps.getProducts(opportunityId),
      deps.getActivities(opportunityId),
      deps.getStage(opportunityId),
      deps.getResolvedItems(opportunityId),
      deps.getSalesOrders(opportunityId),
    ]);

  const opportunity = settledSection(
    overviewResult,
    (value) => ({
      opportunityName: value.opportunityName,
      noOpp: value.noOpp,
      customer: value.customer,
      owner: value.owner,
      status: value.status,
      warehouse: value.warehouse,
      destination: value.destination,
      productFamily: value.productFamily,
      forecastCategory: value.forecastCategory,
    }),
  );

  const stage = settledSection(stageResult, (value) => ({
    noOpp: value.noOpp,
    name: value.name,
    process: value.process,
    status: value.status,
    orderReadiness: value.orderReadiness,
  }));

  const products = settledSection(
    productsResult,
    (value) => ({
      total: value.products.length,
      totalQuantity: value.products.reduce((sum, item) => sum + item.quantity, 0),
      totalAmount: value.products.reduce((sum, item) => sum + item.amount, 0),
      items: value.products.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        uom: item.uom,
        amount: item.amount,
        discount: item.discount,
      })),
    }),
    (value) => value.products.length === 0,
  );

  const activities = settledSection(
    activitiesResult,
    (value) => ({
      total: value.activities.length,
      open: value.activities.filter((item) =>
        item.status.toLowerCase().includes("open"),
      ).length,
      items: value.activities.slice(0, 5),
    }),
    (value) => value.activities.length === 0,
  );

  let stock: OpportunityIntelligence["stock"];
  let msds: OpportunityIntelligence["msds"];

  if (resolvedResult.status === "fulfilled") {
    const [stockResult, msdsResult] = await Promise.allSettled([
      deps.checkStock(opportunityId, resolvedResult.value.items),
      deps.getMsdsFromResolvedItems(opportunityId, resolvedResult.value.items),
    ]);

    stock = settledSection(
      stockResult,
      (value) => ({
        warehouse: value.warehouse,
        summary: value.summary,
        items: value.items.map((item) => ({
          productName: item.productName,
          uom: item.uom,
          requestedQuantity: item.requestedQuantity,
          available: item.available,
          stockStatus: item.stockStatus,
        })),
      }),
      (value) => value.items.length === 0,
    );

    msds = settledSection(
      msdsResult,
      (value) => ({
        summary: value.summary,
        products: value.products.map((item) => ({
          productName: item.productName,
          msdsFound: item.msdsFound,
          totalDocuments: item.totalDocuments,
        })),
      }),
      (value) => value.products.length === 0,
    );
  } else {
    const reason = `Item resolution failed: ${safeReason(resolvedResult.reason)}`;
    stock = failed(reason);
    msds = failed(reason);
  }

  const salesOrders = settledSection(
    salesOrdersResult,
    (value) => ({
      total: value.total,
      items: value.salesOrders.map((item) => ({
        salesOrderNumber: item.salesOrderNumber,
        status: item.status,
        totalAmount: item.totalAmount,
        warehouse: item.warehouse,
        requestedShippingDate: item.requestedShippingDate,
        requestedReceiptDate: item.requestedReceiptDate,
        confirmedShippingDate: item.confirmedShippingDate,
        confirmedReceiptDate: item.confirmedReceiptDate,
        specialInstruction: item.specialInstruction,
      })),
    }),
    (value) => value.total === 0,
  );

  let deliveries: OpportunityIntelligence["deliveries"];
  let invoices: OpportunityIntelligence["invoices"];

  if (salesOrdersResult.status === "fulfilled") {
    const [deliveryResult, invoiceResult] = await Promise.allSettled([
      deps.getDeliveryFromSalesOrders(salesOrdersResult.value),
      deps.getInvoicesFromSalesOrders(salesOrdersResult.value),
    ]);

    deliveries = settledSection(
      deliveryResult,
      (value) => ({
        total: value.totalDeliveries,
        items: value.deliveries.map((item) => ({
          salesOrderNumber: item.salesOrderNumber,
          packingSlipId: item.packingSlipId,
          deliveryDate: item.deliveryDate,
          receiptDate: item.receiptDate,
          quantity: item.quantity,
          warehouse: item.warehouse,
          received: item.received,
        })),
      }),
      (value) => value.totalDeliveries === 0,
    );

    invoices = settledSection(
      invoiceResult,
      (value) => ({
        total: value.totalInvoices,
        totalInvoiceAmount: value.totalInvoiceAmount,
        items: value.invoices.map((item) => ({
          invoiceNumber: item.invoiceNumber,
          invoiceDate: item.invoiceDate,
          salesOrderNumber: item.salesOrderNumber,
          currency: item.currency,
          paymentTerms: item.paymentTerms,
          invoiceAmount: item.invoiceAmount,
          taxAmount: item.taxAmount,
        })),
      }),
      (value) => value.totalInvoices === 0,
    );
  } else {
    const reason = `Sales Order lookup failed: ${safeReason(salesOrdersResult.reason)}`;
    deliveries = failed(reason);
    invoices = failed(reason);
  }

  return {
    opportunity,
    stage,
    products,
    activities,
    stock,
    salesOrders,
    deliveries,
    invoices,
    msds,
  };
}
