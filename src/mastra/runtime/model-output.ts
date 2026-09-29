type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pick(value: unknown, keys: readonly string[]) {
  const source = asRecord(value);
  return Object.fromEntries(
    keys.filter((key) => key in source).map((key) => [key, source[key]]),
  );
}

function pickList(value: unknown, key: string, fields: readonly string[]) {
  const source = asRecord(value);
  return asArray(source[key]).map((item) => pick(item, fields));
}

function compactLocation(value: unknown) {
  return pick(value, [
    "name",
    "address",
    "city",
    "district",
    "province",
    "postalCode",
    "country",
    "routeText",
    "coordinateSource",
  ]);
}

export function compactToolResult(toolName: string, result: unknown): unknown {
  const value = asRecord(result);

  switch (toolName) {
    case "common.get_opportunity_intelligence":
      return result;

    case "crm.get_opportunity_overview":
      return pick(result, [
        "opportunityName",
        "noOpp",
        "customer",
        "owner",
        "status",
        "warehouse",
        "destination",
        "productFamily",
        "forecastCategory",
      ]);

    case "crm.get_opportunity_products": {
      const products = pickList(result, "products", [
        "name",
        "quantity",
        "uom",
        "price",
        "amount",
        "discount",
      ]);
      return { total: products.length, products };
    }

    case "crm.get_opportunity_activities": {
      const activities = pickList(result, "activities", [
        "subject",
        "owner",
        "status",
        "startDate",
      ]).slice(0, 5);
      return { total: asArray(value.activities).length, activities };
    }

    case "crm.get_opportunity_stage":
      return pick(result, ["noOpp", "name", "process", "status", "orderReadiness"]);

    case "finops.resolve_opportunity_items":
      return {
        summary: value.summary ?? null,
        items: pickList(result, "items", [
          "productName",
          "uom",
          "productNumber",
          "itemNumber",
          "status",
        ]),
      };

    case "finops.check_stock_availability":
      return {
        warehouse: value.warehouse ?? "",
        summary: value.summary ?? null,
        items: pickList(result, "items", [
          "productName",
          "itemNumber",
          "uom",
          "requestedQuantity",
          "available",
          "stockStatus",
        ]),
      };

    case "finops.get_sales_orders":
      return {
        noOpp: value.noOpp ?? "",
        total: value.total ?? 0,
        salesOrders: pickList(result, "salesOrders", [
          "salesOrderNumber",
          "status",
          "processingStatus",
          "customerAccount",
          "currency",
          "totalAmount",
          "requestedShippingDate",
          "requestedReceiptDate",
          "confirmedShippingDate",
          "confirmedReceiptDate",
          "site",
          "warehouse",
          "specialInstruction",
        ]),
      };

    case "finops.get_delivery_status":
      return {
        noOpp: value.noOpp ?? "",
        totalSalesOrders: value.totalSalesOrders ?? 0,
        totalDeliveries: value.totalDeliveries ?? 0,
        deliveries: pickList(result, "deliveries", [
          "salesOrderNumber",
          "packingSlipId",
          "purchaseOrder",
          "deliveryDate",
          "receiptDate",
          "quantity",
          "warehouse",
          "received",
          "deliveryName",
        ]),
      };

    case "finops.get_invoices":
      return {
        noOpp: value.noOpp ?? "",
        totalSalesOrders: value.totalSalesOrders ?? 0,
        totalInvoices: value.totalInvoices ?? 0,
        totalInvoiceAmount: value.totalInvoiceAmount ?? 0,
        invoices: pickList(result, "invoices", [
          "invoiceNumber",
          "invoiceDate",
          "salesOrderNumber",
          "customerAccount",
          "currency",
          "paymentTerms",
          "invoiceAmount",
          "taxAmount",
        ]),
      };

    case "sharepoint.get_msds":
      return {
        summary: value.summary ?? null,
        products: asArray(value.products).map((productValue) => {
          const product = asRecord(productValue);
          return {
            ...pick(product, [
              "productName",
              "itemNumber",
              "status",
              "msdsFound",
              "totalDocuments",
            ]),
            documents: asArray(product.documents).map((document) =>
              pick(document, ["category", "fileName", "url"]),
            ),
          };
        }),
      };

    case "common.get_delivery_context":
      return {
        ...pick(result, ["noOpp", "inventorySiteId", "readyForEstimation"]),
        origin: compactLocation(value.origin),
        destination: compactLocation(value.destination),
      };

    case "common.get_route_estimate":
      return {
        ...pick(result, ["available", "noOpp", "route", "reason"]),
        origin: compactLocation(value.origin),
        destination: compactLocation(value.destination),
      };

    case "knowledge.search":
      return {
        found: value.found ?? false,
        query: value.query ?? "",
        totalResults: value.totalResults ?? 0,
        results: asArray(value.results).map((item) =>
          pick(item, [
            "score",
            "title",
            "docNumber",
            "docType",
            "process",
            "docVersion",
            "content",
            "sourceUrl",
            "sourceModifiedAt",
          ]),
        ),
      };

    case "web.search":
      return {
        query: value.query ?? "",
        results: asArray(value.results).map((item) =>
          pick(item, ["title", "url", "snippet"]),
        ),
      };

    default:
      return result;
  }
}

export function toTextModelOutput(toolName: string, result: unknown) {
  return {
    type: "text" as const,
    value: JSON.stringify(compactToolResult(toolName, result)),
  };
}
