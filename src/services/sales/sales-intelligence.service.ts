import {
  findOpportunityIdsByProduct,
  getAccountsByIds,
  getOpportunityActivities,
  getOpportunityById,
  getOpportunityPartials,
  getOpportunityPartialsByIds,
  getOpportunityProducts,
  getOpportunityProductsByOpportunityIds,
  getOpportunityDimensionRefsByIds,
  getProductById,
  getSystemUsersByIds,
  getUomById,
  getUomsBySchedule,
  queryOpportunityActualRevenueByDate,
  queryOpportunities,
  queryPartialRevenueByDate,
  resolveEntity,
  type CrmOpportunity,
  type CrmOpportunityPartial,
  type CrmOpportunityProduct,
  type SalesEntityType,
} from "../microsoft/dynamics-crm/sales-crm.service.js";
import {
  getDirectItemStock,
  getOpportunityOperations,
  resolveProductStock,
} from "../microsoft/dynamics-finops/sales-finops.service.js";
import {
  findMsdsByProductName,
  findMsdsByProductNames,
} from "../microsoft/sharepoint/msds.service.js";
import { normalizeText } from "../../utils/text.util.js";
export type SalesMetric =
  | "opportunityCount"
  | "estimatedRevenue"
  | "actualRevenue"
  | "partialRevenue"
  | "partialCount"
  | "quantity"
  | "salesOrderCount"
  | "deliveryCount"
  | "invoiceCount"
  | "invoiceAmount";
export type SalesQueryInput = {
  filters?: {
    salesmanId?: string;
    customerId?: string;
    productId?: string;
    opportunityId?: string;
    from?: string;
    to?: string;
    status?: "open" | "won" | "lost" | "all";
  };
  groupBy?: "none" | "salesman" | "customer" | "product" | "opportunity";
  metrics: SalesMetric[];
  opportunityDateField?: "createdOn" | "estimatedCloseDate" | "actualCloseDate";
  sortBy?: SalesMetric;
  sortDirection?: "asc" | "desc";
  limit?: number;
};

export type SalesQueryOptions = {
  signal?: AbortSignal;
};

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) {
    throw signal.reason;
  }
  throw new Error("Sales query aborted");
}

function dateOnly(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}
function inRange(value: string | null | undefined, from?: string, to?: string) {
  if (!from && !to) return true;
  const date = dateOnly(value);
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}
function sum(values: number[]) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}
function uniqueCount(values: string[]) {
  return new Set(values.filter(Boolean)).size;
}
function quantityByUom(lines: CrmOpportunityProduct[]) {
  const totals = new Map<string, number>();
  for (const line of lines) {
    const uom = line.uomName || "(no UOM)";
    totals.set(uom, (totals.get(uom) ?? 0) + line.quantity);
  }
  return [...totals.entries()]
    .map(([uom, quantity]) => ({ uom, quantity }))
    .sort((a, b) => a.uom.localeCompare(b.uom));
}
function amountByCurrency<
  T extends { currency: string; invoiceAmount: number },
>(rows: T[]) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const currency = row.currency || "UNKNOWN";
    totals.set(currency, (totals.get(currency) ?? 0) + row.invoiceAmount);
  }
  return [...totals.entries()].map(([currency, amount]) => ({
    currency,
    amount,
  }));
}
function requested(metrics: SalesMetric[], metric: SalesMetric) {
  return metrics.includes(metric);
}
export function calculateOpportunityRevenue(
  opportunityActualValue: number,
  partials: CrmOpportunityPartial[],
) {
  const partialRevenue = sum(partials.map((row) => row.extendedAmount));
  const partialCount = uniqueCount(partials.map((row) => row.partialId));
  return {
    opportunityActualRevenue: Number(opportunityActualValue ?? 0),
    partialRevenue,
    partialCount,
    actualRevenue: Number(opportunityActualValue ?? 0) + partialRevenue,
  };
}
export async function resolveSalesEntity(type: SalesEntityType, query: string) {
  return resolveEntity(type, query);
}
export async function checkStock(input: {
  itemId?: string;
  productId?: string;
  uomId?: string;
  warehouse?: string;
}) {
  if (input.itemId) {
    return {
      mode: "item" as const,
      ...(await getDirectItemStock(input.itemId, input.warehouse)),
    };
  }
  if (!input.productId) {
    throw new Error("productId or itemId is required");
  }
  const product = await getProductById(input.productId);
  let variants: Array<{ uomId: string | null; uomName: string }> = [];
  if (input.uomId) {
    const uom = await getUomById(input.uomId);
    variants = [{ uomId: uom.uomId, uomName: uom.name }];
  } else if (product.uomScheduleId) {
    variants = (await getUomsBySchedule(product.uomScheduleId)).map((uom) => ({
      uomId: uom.uomId,
      uomName: uom.name,
    }));
  } else if (product.defaultUomId) {
    const uom = await getUomById(product.defaultUomId);
    variants = [{ uomId: uom.uomId, uomName: uom.name }];
  }
  const result = await resolveProductStock({
    productName: product.name,
    variants,
    warehouse: input.warehouse,
  });
  return {
    mode: "product" as const,
    product: {
      productId: product.productId,
      name: product.name,
      productNumber: product.productNumber,
    },
    ...result,
  };
}
export async function getProductMsds(productName: string) {
  return findMsdsByProductName(productName);
}
export async function getOpportunityIntelligence(opportunityId: string) {
  const [opportunity, products, activities, partials] = await Promise.all([
    getOpportunityById(opportunityId),
    getOpportunityProducts(opportunityId),
    getOpportunityActivities(opportunityId),
    getOpportunityPartials(opportunityId),
  ]);
  const warnings: string[] = [];
  let operations: Awaited<ReturnType<typeof getOpportunityOperations>> | null =
    null;
  try {
    operations = await getOpportunityOperations([opportunity.noOpp]);
  } catch (error) {
    warnings.push(
      `FinOps operations unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
  const uniqueProducts = [
    ...new Set(products.map((item) => item.productName).filter(Boolean)),
  ];
  let msds: Record<
    string,
    Awaited<ReturnType<typeof findMsdsByProductName>>
  > = {};
  try {
    msds = await findMsdsByProductNames(uniqueProducts);
  } catch (error) {
    warnings.push(
      `MSDS unavailable: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
  const stock: unknown[] = [];
  const productGroups = new Map<string, CrmOpportunityProduct[]>();
  for (const line of products) {
    const key = line.productId ?? line.productName;
    productGroups.set(key, [...(productGroups.get(key) ?? []), line]);
  }
  for (const lines of productGroups.values()) {
    const first = lines[0];
    try {
      const variants = [
        ...new Map(
          lines
            .filter((line) => line.uomName)
            .map((line) => [
              line.uomId ?? line.uomName,
              { uomId: line.uomId, uomName: line.uomName },
            ]),
        ).values(),
      ];
      stock.push(
        await resolveProductStock({
          productName: first.productName,
          variants,
          warehouse: opportunity.warehouse || undefined,
        }),
      );
    } catch (error) {
      warnings.push(
        `Stock unavailable for ${first.productName}: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
  const orderedPartials = [...partials].sort((a, b) =>
    String(a.actualCloseDate ?? a.createdOn ?? "").localeCompare(
      String(b.actualCloseDate ?? b.createdOn ?? ""),
    ),
  );
  const revenue = calculateOpportunityRevenue(
    opportunity.actualValue,
    orderedPartials,
  );
  return {
    opportunity,
    revenue: {
      estimatedRevenue: opportunity.estimatedValue,
      ...revenue,
      currency: opportunity.currency || null,
    },
    products,
    partials: orderedPartials.map((row, index) => ({
      sequence: index + 1,
      ...row,
    })),
    activities,
    operations: operations
      ? {
          summary: {
            salesOrderCount: uniqueCount(
              operations.salesOrders.map((row) => row.salesOrderNumber),
            ),
            deliveryCount: uniqueCount(
              operations.deliveries.map((row) => row.packingSlipId),
            ),
            invoiceCount: uniqueCount(
              operations.invoices.map((row) => row.invoiceNumber),
            ),
            invoiceAmountByCurrency: amountByCurrency(operations.invoices),
          },
          ...operations,
        }
      : null,
    stock,
    msds: uniqueProducts
      .map((productName) => msds[productName])
      .filter(Boolean),
    warnings,
  };
}
function opportunityMetricRows(
  opportunities: CrmOpportunity[],
  field: SalesQueryInput["opportunityDateField"],
  from?: string,
  to?: string,
) {
  const dateField = field ?? "createdOn";
  return opportunities.filter((row) => inRange(row[dateField], from, to));
}
function filterProductsByParentDate(
  products: CrmOpportunityProduct[],
  opportunityById: Map<string, CrmOpportunity>,
  field: SalesQueryInput["opportunityDateField"],
  from?: string,
  to?: string,
) {
  const eligible = new Set(
    opportunityMetricRows([...opportunityById.values()], field, from, to).map(
      (row) => row.opportunityId,
    ),
  );
  return products.filter((line) => eligible.has(line.opportunityId));
}
function summarizeGroup(input: {
  opportunities: CrmOpportunity[];
  products: CrmOpportunityProduct[];
  partials: CrmOpportunityPartial[];
  operations: Awaited<ReturnType<typeof getOpportunityOperations>> | null;
  metrics: SalesMetric[];
  from?: string;
  to?: string;
  opportunityDateField?: SalesQueryInput["opportunityDateField"];
}) {
  const {
    opportunities,
    products,
    partials,
    operations,
    metrics,
    from,
    to,
    opportunityDateField,
  } = input;
  const opportunityById = new Map(
    opportunities.map((row) => [row.opportunityId, row]),
  );
  const opportunityRows = opportunityMetricRows(
    opportunities,
    opportunityDateField,
    from,
    to,
  );
  const productRows = filterProductsByParentDate(
    products,
    opportunityById,
    opportunityDateField,
    from,
    to,
  );
  const partialRows = partials.filter((row) =>
    inRange(row.actualCloseDate ?? row.createdOn, from, to),
  );
  const actualOpportunityRows = opportunities.filter((row) =>
    inRange(row.actualCloseDate, from, to),
  );
  const opportunityNos = new Set(
    opportunities.map((row) => row.noOpp).filter(Boolean),
  );
  const salesOrders = (operations?.salesOrders ?? []).filter(
    (row) =>
      opportunityNos.has(row.opportunityNo) && inRange(row.createdAt, from, to),
  );
  const allGroupSalesOrderNumbers = new Set(
    (operations?.salesOrders ?? [])
      .filter((row) => opportunityNos.has(row.opportunityNo))
      .map((row) => row.salesOrderNumber),
  );
  const deliveries = (operations?.deliveries ?? []).filter(
    (row) =>
      allGroupSalesOrderNumbers.has(row.salesOrderNumber) &&
      inRange(row.deliveryDate, from, to),
  );
  const invoices = (operations?.invoices ?? []).filter(
    (row) =>
      allGroupSalesOrderNumbers.has(row.salesOrderNumber) &&
      inRange(row.invoiceDate, from, to),
  );
  const output: Record<string, unknown> = {};
  if (requested(metrics, "opportunityCount")) {
    output.opportunityCount = uniqueCount(
      opportunityRows.map((row) => row.opportunityId),
    );
  }
  if (requested(metrics, "estimatedRevenue")) {
    output.estimatedRevenue = sum(
      opportunityRows.map((row) => row.estimatedValue),
    );
  }
  if (requested(metrics, "actualRevenue")) {
    output.actualRevenue =
      sum(actualOpportunityRows.map((row) => row.actualValue)) +
      sum(partialRows.map((row) => row.extendedAmount));
  }
  if (requested(metrics, "partialRevenue")) {
    output.partialRevenue = sum(partialRows.map((row) => row.extendedAmount));
  }
  if (requested(metrics, "partialCount")) {
    output.partialCount = uniqueCount(partialRows.map((row) => row.partialId));
  }
  if (requested(metrics, "quantity")) {
    const quantities = quantityByUom(productRows);
    output.quantity = quantities.length === 1 ? quantities[0].quantity : null;
    output.quantityByUom = quantities;
  }
  if (requested(metrics, "salesOrderCount")) {
    output.salesOrderCount = uniqueCount(
      salesOrders.map((row) => row.salesOrderNumber),
    );
  }
  if (requested(metrics, "deliveryCount")) {
    output.deliveryCount = uniqueCount(
      deliveries.map((row) => row.packingSlipId),
    );
  }
  if (requested(metrics, "invoiceCount")) {
    output.invoiceCount = uniqueCount(invoices.map((row) => row.invoiceNumber));
  }
  if (requested(metrics, "invoiceAmount")) {
    const byCurrency = amountByCurrency(invoices);
    output.invoiceAmount =
      byCurrency.length === 1 ? byCurrency[0].amount : null;
    output.invoiceAmountByCurrency = byCurrency;
  }
  return output;
}
function productNameMatches(fullName: string, crmProductName: string) {
  const full = normalizeText(fullName).toUpperCase();
  const base = normalizeText(crmProductName).toUpperCase();
  return Boolean(base && (full === base || full.startsWith(`${base} `)));
}
function summarizeProductGroup(input: {
  productId: string | null;
  productName: string;
  opportunities: CrmOpportunity[];
  products: CrmOpportunityProduct[];
  partials: CrmOpportunityPartial[];
  operations: Awaited<ReturnType<typeof getOpportunityOperations>> | null;
  metrics: SalesMetric[];
  from?: string;
  to?: string;
  opportunityDateField?: SalesQueryInput["opportunityDateField"];
}) {
  const relevantProducts = input.products.filter(
    (row) =>
      (input.productId && row.productId === input.productId) ||
      (!input.productId && row.productName === input.productName),
  );
  const relevantPartials = input.partials.filter(
    (row) =>
      (input.productId && row.productId === input.productId) ||
      (!input.productId && row.productName === input.productName),
  );
  const opportunityIds = new Set([
    ...relevantProducts.map((row) => row.opportunityId),
    ...relevantPartials.map((row) => row.opportunityId),
  ]);
  const opportunities = input.opportunities.filter((row) =>
    opportunityIds.has(row.opportunityId),
  );
  const byId = new Map(opportunities.map((row) => [row.opportunityId, row]));
  const eligibleOppIds = new Set(
    opportunityMetricRows(
      opportunities,
      input.opportunityDateField,
      input.from,
      input.to,
    ).map((row) => row.opportunityId),
  );
  const productsInRange = relevantProducts.filter((row) =>
    eligibleOppIds.has(row.opportunityId),
  );
  const partialsInRange = relevantPartials.filter((row) =>
    inRange(row.actualCloseDate ?? row.createdOn, input.from, input.to),
  );
  const finalWonLines = relevantProducts.filter((row) => {
    const opp = byId.get(row.opportunityId);
    return (
      opp?.stateCode === 1 && inRange(opp.actualCloseDate, input.from, input.to)
    );
  });
  const salesOrderLines = (input.operations?.salesOrderLines ?? []).filter(
    (row) => productNameMatches(row.productName, input.productName),
  );
  const relevantSoNumbers = new Set(
    salesOrderLines.map((row) => row.salesOrderNumber),
  );
  const soHeaders = (input.operations?.salesOrders ?? []).filter(
    (row) =>
      relevantSoNumbers.has(row.salesOrderNumber) &&
      inRange(row.createdAt, input.from, input.to),
  );
  const deliveryLines = (input.operations?.deliveryLines ?? []).filter(
    (row) =>
      productNameMatches(row.productName, input.productName) &&
      inRange(row.deliveryDate, input.from, input.to),
  );
  const invoiceLines = (input.operations?.invoiceLines ?? []).filter(
    (row) =>
      productNameMatches(row.productName, input.productName) &&
      inRange(row.invoiceDate, input.from, input.to),
  );
  const output: Record<string, unknown> = {};
  if (requested(input.metrics, "opportunityCount")) {
    output.opportunityCount = eligibleOppIds.size;
  }
  if (requested(input.metrics, "estimatedRevenue")) {
    output.estimatedRevenue = sum(
      productsInRange.map((row) => row.extendedAmount),
    );
    output.estimatedRevenueBasis = "opportunity_product_line";
  }
  if (requested(input.metrics, "actualRevenue")) {
    output.actualRevenue =
      sum(finalWonLines.map((row) => row.extendedAmount)) +
      sum(partialsInRange.map((row) => row.extendedAmount));
    output.actualRevenueBasis = "won_product_lines_plus_partial_lines";
  }
  if (requested(input.metrics, "partialRevenue")) {
    output.partialRevenue = sum(
      partialsInRange.map((row) => row.extendedAmount),
    );
  }
  if (requested(input.metrics, "partialCount")) {
    output.partialCount = uniqueCount(
      partialsInRange.map((row) => row.partialId),
    );
  }
  if (requested(input.metrics, "quantity")) {
    const quantities = quantityByUom(productsInRange);
    output.quantity = quantities.length === 1 ? quantities[0].quantity : null;
    output.quantityByUom = quantities;
  }
  if (requested(input.metrics, "salesOrderCount")) {
    output.salesOrderCount = uniqueCount(
      soHeaders.map((row) => row.salesOrderNumber),
    );
  }
  if (requested(input.metrics, "deliveryCount")) {
    output.deliveryCount = uniqueCount(
      deliveryLines.map((row) => row.packingSlipId),
    );
  }
  if (requested(input.metrics, "invoiceCount")) {
    output.invoiceCount = uniqueCount(
      invoiceLines.map((row) => row.invoiceNumber),
    );
  }
  if (requested(input.metrics, "invoiceAmount")) {
    const totals = new Map<string, number>();
    for (const row of invoiceLines) {
      const currency = row.currency || "UNKNOWN";
      totals.set(currency, (totals.get(currency) ?? 0) + row.lineAmount);
    }
    const byCurrency = [...totals.entries()].map(([currency, amount]) => ({
      currency,
      amount,
    }));
    output.invoiceAmount =
      byCurrency.length === 1 ? byCurrency[0].amount : null;
    output.invoiceAmountByCurrency = byCurrency;
    output.invoiceAmountBasis = "invoice_lines";
  }
  return output;
}
type RankedSalesGroup = {
  id: string | null;
  name: string;
  metrics: Record<string, unknown>;
};

function numericMetricValue(
  group: Record<string, unknown>,
  metric?: SalesMetric,
) {
  if (!metric) return 0;
  const metrics = group.metrics;
  if (!metrics || typeof metrics !== "object") return 0;
  const value = (metrics as Record<string, unknown>)[metric];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function rankGroups(
  groups: Array<Record<string, unknown>>,
  input: SalesQueryInput,
) {
  let output = [...groups];

  if (input.sortBy) {
    const direction = input.sortDirection === "asc" ? 1 : -1;
    output.sort((a, b) => {
      const difference =
        numericMetricValue(a, input.sortBy) -
        numericMetricValue(b, input.sortBy);

      if (difference !== 0) return difference * direction;

      return String(a.name ?? "").localeCompare(String(b.name ?? ""));
    });
  }

  if (input.limit) {
    output = output.slice(0, input.limit);
  }

  return output;
}

type RevenueFastPathGroup = "customer" | "salesman" | "opportunity" | "product";

function canUseRevenueFastPath(
  input: SalesQueryInput,
  metrics: SalesMetric[],
  groupBy: SalesQueryInput["groupBy"],
): boolean {
  const filters = input.filters ?? {};
  const supportedMetrics = new Set<SalesMetric>([
    "actualRevenue",
    "partialRevenue",
    "partialCount",
  ]);

  if (
    groupBy !== "customer" &&
    groupBy !== "salesman" &&
    groupBy !== "opportunity" &&
    groupBy !== "product"
  ) {
    return false;
  }

  if (!filters.from || !filters.to) return false;
  if (filters.status && filters.status !== "all") return false;
  if (!metrics.every((metric) => supportedMetrics.has(metric))) return false;

  // Product filtering changes the revenue basis to product lines. Only the
  // product fast path handles that case safely.
  if (filters.productId && groupBy !== "product") return false;

  return true;
}

type RevenueAccumulator = {
  id: string;
  name: string;
  opportunityActualRevenue: number;
  partialRevenue: number;
  partialIds: Set<string>;
  opportunityIds: Set<string>;
};

async function queryDimensionRevenueFastPath(
  groupBy: Exclude<RevenueFastPathGroup, "product">,
  input: SalesQueryInput,
  metrics: SalesMetric[],
  options: SalesQueryOptions,
) {
  const filters = input.filters ?? {};
  const from = filters.from!;
  const to = filters.to!;

  throwIfAborted(options.signal);

  const needsHeaders = requested(metrics, "actualRevenue");
  const needsPartials = metrics.some((metric) =>
    ["actualRevenue", "partialRevenue", "partialCount"].includes(metric),
  );

  const [headers, partialRows] = await Promise.all([
    needsHeaders
      ? queryOpportunityActualRevenueByDate(
          {
            from,
            to,
            salesmanId: filters.salesmanId,
            customerId: filters.customerId,
            opportunityId: filters.opportunityId,
          },
          { signal: options.signal },
        )
      : Promise.resolve([]),
    needsPartials
      ? queryPartialRevenueByDate(
          {
            from,
            to,
            salesmanId: filters.salesmanId,
            customerId: filters.customerId,
            opportunityId: filters.opportunityId,
          },
          { signal: options.signal },
        )
      : Promise.resolve([]),
  ]);

  throwIfAborted(options.signal);

  const refsNeeded = new Set<string>();

  for (const row of partialRows) {
    if (!row.opportunityId) continue;

    if (groupBy === "customer" && !row.customerId) {
      refsNeeded.add(row.opportunityId);
    }

    if (groupBy === "salesman" && !row.ownerId) {
      refsNeeded.add(row.opportunityId);
    }

    if (groupBy === "opportunity" && !row.opportunityNo) {
      refsNeeded.add(row.opportunityId);
    }
  }

  const dimensionRefs =
    refsNeeded.size > 0
      ? await getOpportunityDimensionRefsByIds([...refsNeeded], {
          signal: options.signal,
        })
      : [];

  const refByOpportunity = new Map(
    dimensionRefs.map((row) => [row.opportunityId, row]),
  );

  const grouped = new Map<string, RevenueAccumulator>();

  const ensure = (id: string, name?: string) => {
    const existing = grouped.get(id);
    if (existing) {
      if ((!existing.name || existing.name === existing.id) && name) {
        existing.name = name;
      }
      return existing;
    }

    const created: RevenueAccumulator = {
      id,
      name: name || id,
      opportunityActualRevenue: 0,
      partialRevenue: 0,
      partialIds: new Set<string>(),
      opportunityIds: new Set<string>(),
    };

    grouped.set(id, created);
    return created;
  };

  for (const row of headers) {
    let id: string | null = null;
    let name = "";

    if (groupBy === "customer") {
      id = row.customerId;
    } else if (groupBy === "salesman") {
      id = row.ownerId;
    } else {
      id = row.opportunityId || null;
      name = row.noOpp || row.name;
    }

    if (!id) continue;

    const current = ensure(id, name);
    current.opportunityActualRevenue += Number(row.actualValue || 0);
    if (row.opportunityId) current.opportunityIds.add(row.opportunityId);
  }

  for (const row of partialRows) {
    const parentRef = row.opportunityId
      ? refByOpportunity.get(row.opportunityId)
      : undefined;

    let id: string | null = null;
    let name = "";

    if (groupBy === "customer") {
      id = row.customerId ?? parentRef?.customerId ?? null;
    } else if (groupBy === "salesman") {
      id = row.ownerId ?? parentRef?.ownerId ?? null;
    } else {
      id = row.opportunityId || null;
      name = row.opportunityNo || parentRef?.noOpp || parentRef?.name || "";
    }

    if (!id) continue;

    const current = ensure(id, name);
    current.partialRevenue += Number(row.extendedAmount || 0);
    if (row.partialId) current.partialIds.add(row.partialId);
    if (row.opportunityId) current.opportunityIds.add(row.opportunityId);
  }

  const rawGroups: RankedSalesGroup[] = [...grouped.values()].map((group) => {
    const groupMetrics: Record<string, unknown> = {};

    if (requested(metrics, "actualRevenue")) {
      groupMetrics.actualRevenue =
        group.opportunityActualRevenue + group.partialRevenue;
    }

    if (requested(metrics, "partialRevenue")) {
      groupMetrics.partialRevenue = group.partialRevenue;
    }

    if (requested(metrics, "partialCount")) {
      groupMetrics.partialCount = group.partialIds.size;
    }

    return {
      id: group.id,
      name: group.name,
      metrics: groupMetrics,
    };
  });

  const totalGroupsBeforeLimit = rawGroups.length;
  const rankedGroups = rankGroups(
    rawGroups as Array<Record<string, unknown>>,
    input,
  ) as RankedSalesGroup[];

  if (groupBy === "customer") {
    const accounts = await getAccountsByIds(
      rankedGroups
        .map((group) => group.id)
        .filter((id): id is string => Boolean(id)),
      { signal: options.signal },
    );

    const nameById = new Map(
      accounts.map((account) => [account.accountId, account.name]),
    );

    for (const group of rankedGroups) {
      if (group.id) group.name = nameById.get(group.id) || group.name;
    }
  }

  if (groupBy === "salesman") {
    const users = await getSystemUsersByIds(
      rankedGroups
        .map((group) => group.id)
        .filter((id): id is string => Boolean(id)),
      { signal: options.signal },
    );

    const nameById = new Map(
      users.map((user) => [user.systemUserId, user.name]),
    );

    for (const group of rankedGroups) {
      if (group.id) group.name = nameById.get(group.id) || group.name;
    }
  }

  const opportunityIds = new Set<string>();
  for (const group of grouped.values()) {
    for (const opportunityId of group.opportunityIds) {
      opportunityIds.add(opportunityId);
    }
  }

  const summary: Record<string, unknown> = {};
  const opportunityActualRevenue = sum(headers.map((row) => row.actualValue));
  const partialRevenue = sum(partialRows.map((row) => row.extendedAmount));

  if (requested(metrics, "actualRevenue")) {
    summary.actualRevenue = opportunityActualRevenue + partialRevenue;
  }

  if (requested(metrics, "partialRevenue")) {
    summary.partialRevenue = partialRevenue;
  }

  if (requested(metrics, "partialCount")) {
    summary.partialCount = uniqueCount(partialRows.map((row) => row.partialId));
  }

  return {
    filters,
    groupBy,
    metrics,
    sortBy: input.sortBy ?? null,
    sortDirection: input.sortDirection ?? "desc",
    limit: input.limit ?? null,
    optimizedPath: `${groupBy}_actual_revenue_by_date`,
    totalMatchedOpportunities: opportunityIds.size,
    totalGroupsBeforeLimit,
    summary,
    groups: rankedGroups,
  };
}

type ProductRevenueAccumulator = {
  id: string | null;
  name: string;
  finalRevenue: number;
  partialRevenue: number;
  partialIds: Set<string>;
  opportunityIds: Set<string>;
};

async function queryProductRevenueFastPath(
  input: SalesQueryInput,
  metrics: SalesMetric[],
  options: SalesQueryOptions,
) {
  const filters = input.filters ?? {};
  const from = filters.from!;
  const to = filters.to!;

  throwIfAborted(options.signal);

  const needsFinalLines = requested(metrics, "actualRevenue");
  const needsPartials = metrics.some((metric) =>
    ["actualRevenue", "partialRevenue", "partialCount"].includes(metric),
  );

  const [closedHeaders, partialRows] = await Promise.all([
    needsFinalLines
      ? queryOpportunityActualRevenueByDate(
          {
            from,
            to,
            salesmanId: filters.salesmanId,
            customerId: filters.customerId,
            opportunityId: filters.opportunityId,
          },
          { signal: options.signal },
        )
      : Promise.resolve([]),
    needsPartials
      ? queryPartialRevenueByDate(
          {
            from,
            to,
            salesmanId: filters.salesmanId,
            customerId: filters.customerId,
            opportunityId: filters.opportunityId,
            productId: filters.productId,
          },
          { signal: options.signal },
        )
      : Promise.resolve([]),
  ]);

  throwIfAborted(options.signal);

  const wonOpportunityIds = closedHeaders
    .filter((row) => row.stateCode === 1 && row.opportunityId)
    .map((row) => row.opportunityId);

  const finalLines =
    needsFinalLines && wonOpportunityIds.length > 0
      ? await getOpportunityProductsByOpportunityIds(wonOpportunityIds, {
          signal: options.signal,
        })
      : [];

  throwIfAborted(options.signal);

  const filteredFinalLines = filters.productId
    ? finalLines.filter((row) => row.productId === filters.productId)
    : finalLines;

  const filteredPartialRows = filters.productId
    ? partialRows.filter((row) => row.productId === filters.productId)
    : partialRows;

  const grouped = new Map<string, ProductRevenueAccumulator>();

  const ensure = (productId: string | null, productName: string) => {
    const normalizedName = normalizeText(productName);
    if (!productId && !normalizedName) return null;

    const key = productId
      ? `id:${productId}`
      : `name:${normalizedName.toUpperCase()}`;

    const existing = grouped.get(key);
    if (existing) {
      if (!existing.name && normalizedName) existing.name = normalizedName;
      return existing;
    }

    const created: ProductRevenueAccumulator = {
      id: productId,
      name: normalizedName || productId || "Unknown Product",
      finalRevenue: 0,
      partialRevenue: 0,
      partialIds: new Set<string>(),
      opportunityIds: new Set<string>(),
    };

    grouped.set(key, created);
    return created;
  };

  for (const row of filteredFinalLines) {
    const current = ensure(row.productId, row.productName);
    if (!current) continue;

    current.finalRevenue += Number(row.extendedAmount || 0);
    if (row.opportunityId) current.opportunityIds.add(row.opportunityId);
  }

  for (const row of filteredPartialRows) {
    const current = ensure(row.productId, row.productName);
    if (!current) continue;

    current.partialRevenue += Number(row.extendedAmount || 0);
    if (row.partialId) current.partialIds.add(row.partialId);
    if (row.opportunityId) current.opportunityIds.add(row.opportunityId);
  }

  const rawGroups: RankedSalesGroup[] = [...grouped.values()].map((group) => {
    const groupMetrics: Record<string, unknown> = {};

    if (requested(metrics, "actualRevenue")) {
      groupMetrics.actualRevenue = group.finalRevenue + group.partialRevenue;
      groupMetrics.actualRevenueBasis = "won_product_lines_plus_partial_lines";
    }

    if (requested(metrics, "partialRevenue")) {
      groupMetrics.partialRevenue = group.partialRevenue;
    }

    if (requested(metrics, "partialCount")) {
      groupMetrics.partialCount = group.partialIds.size;
    }

    return {
      id: group.id,
      name: group.name,
      metrics: groupMetrics,
    };
  });

  const totalGroupsBeforeLimit = rawGroups.length;
  const rankedGroups = rankGroups(
    rawGroups as Array<Record<string, unknown>>,
    input,
  ) as RankedSalesGroup[];

  const opportunityIds = new Set<string>();
  for (const group of grouped.values()) {
    for (const opportunityId of group.opportunityIds) {
      opportunityIds.add(opportunityId);
    }
  }

  const finalRevenue = sum(filteredFinalLines.map((row) => row.extendedAmount));
  const partialRevenue = sum(
    filteredPartialRows.map((row) => row.extendedAmount),
  );

  const summary: Record<string, unknown> = {};

  if (requested(metrics, "actualRevenue")) {
    summary.actualRevenue = finalRevenue + partialRevenue;
    summary.actualRevenueBasis = "won_product_lines_plus_partial_lines";
  }

  if (requested(metrics, "partialRevenue")) {
    summary.partialRevenue = partialRevenue;
  }

  if (requested(metrics, "partialCount")) {
    summary.partialCount = uniqueCount(
      filteredPartialRows.map((row) => row.partialId),
    );
  }

  return {
    filters,
    groupBy: "product" as const,
    metrics,
    sortBy: input.sortBy ?? null,
    sortDirection: input.sortDirection ?? "desc",
    limit: input.limit ?? null,
    optimizedPath: "product_actual_revenue_by_date",
    totalMatchedOpportunities: opportunityIds.size,
    totalGroupsBeforeLimit,
    summary,
    groups: rankedGroups,
  };
}

async function queryRevenueFastPath(
  groupBy: RevenueFastPathGroup,
  input: SalesQueryInput,
  metrics: SalesMetric[],
  options: SalesQueryOptions,
) {
  if (groupBy === "product") {
    return queryProductRevenueFastPath(input, metrics, options);
  }

  return queryDimensionRevenueFastPath(groupBy, input, metrics, options);
}

export async function querySales(
  input: SalesQueryInput,
  options: SalesQueryOptions = {},
) {
  throwIfAborted(options.signal);
  const filters = input.filters ?? {};
  const metrics = [...new Set(input.metrics)];
  const groupBy = input.groupBy ?? "none";

  if (canUseRevenueFastPath(input, metrics, groupBy)) {
    return queryRevenueFastPath(
      groupBy as RevenueFastPathGroup,
      input,
      metrics,
      options,
    );
  }

  let productOpportunityIds: Set<string> | null = null;
  let filteredProduct: Awaited<ReturnType<typeof getProductById>> | null = null;
  if (filters.productId) {
    const [opportunityIds, product] = await Promise.all([
      findOpportunityIdsByProduct(filters.productId),
      getProductById(filters.productId),
    ]);
    throwIfAborted(options.signal);
    productOpportunityIds = new Set(opportunityIds);
    filteredProduct = product;
  }
  let opportunities = await queryOpportunities(
    {
      salesmanId: filters.salesmanId,
      customerId: filters.customerId,
      opportunityId: filters.opportunityId,
      status: filters.status,
    },
    {
      signal: options.signal,
    },
  );
  throwIfAborted(options.signal);
  if (productOpportunityIds) {
    opportunities = opportunities.filter((row) =>
      productOpportunityIds.has(row.opportunityId),
    );
  }
  const opportunityIds = opportunities.map((row) => row.opportunityId);
  const needsProducts =
    Boolean(filters.productId) ||
    groupBy === "product" ||
    requested(metrics, "quantity");
  const needsPartials =
    metrics.some((metric) =>
      ["actualRevenue", "partialRevenue", "partialCount"].includes(metric),
    ) ||
    groupBy === "product" ||
    Boolean(filters.productId);
  const needsFinOps = metrics.some((metric) =>
    [
      "salesOrderCount",
      "deliveryCount",
      "invoiceCount",
      "invoiceAmount",
    ].includes(metric),
  );
  const [products, partials, operations] = await Promise.all([
    needsProducts
      ? getOpportunityProductsByOpportunityIds(opportunityIds, {
          signal: options.signal,
        })
      : Promise.resolve([] as CrmOpportunityProduct[]),
    needsPartials
      ? getOpportunityPartialsByIds(opportunityIds, {
          signal: options.signal,
        })
      : Promise.resolve([] as CrmOpportunityPartial[]),
    needsFinOps
      ? getOpportunityOperations(opportunities.map((row) => row.noOpp))
      : Promise.resolve(null),
  ]);
  throwIfAborted(options.signal);
  const filteredProducts = filters.productId
    ? products.filter((row) => row.productId === filters.productId)
    : products;
  const filteredPartials = filters.productId
    ? partials.filter((row) => row.productId === filters.productId)
    : partials;
  const summarize = (groupInput: {
    opportunities: CrmOpportunity[];
    products: CrmOpportunityProduct[];
    partials: CrmOpportunityPartial[];
  }) => {
    if (filters.productId && filteredProduct) {
      return summarizeProductGroup({
        productId: filters.productId,
        productName: filteredProduct.name,
        ...groupInput,
        operations,
        metrics,
        from: filters.from,
        to: filters.to,
        opportunityDateField: input.opportunityDateField,
      });
    }
    return summarizeGroup({
      ...groupInput,
      operations,
      metrics,
      from: filters.from,
      to: filters.to,
      opportunityDateField: input.opportunityDateField,
    });
  };
  const summary = summarize({
    opportunities,
    products: filteredProducts,
    partials: filteredPartials,
  });
  if (groupBy === "none") {
    return {
      filters,
      groupBy,
      metrics,
      sortBy: input.sortBy ?? null,
      sortDirection: input.sortDirection ?? "desc",
      limit: input.limit ?? null,
      totalMatchedOpportunities: opportunities.length,
      summary,
      groups: [],
    };
  }
  const groups: Array<Record<string, unknown>> = [];
  if (groupBy === "opportunity") {
    for (const opportunity of opportunities) {
      groups.push({
        id: opportunity.opportunityId,
        name: opportunity.noOpp || opportunity.name,
        metrics: summarize({
          opportunities: [opportunity],
          products: filteredProducts.filter(
            (row) => row.opportunityId === opportunity.opportunityId,
          ),
          partials: filteredPartials.filter(
            (row) => row.opportunityId === opportunity.opportunityId,
          ),
        }),
      });
    }
  }
  if (groupBy === "salesman" || groupBy === "customer") {
    const grouped = new Map<
      string,
      { id: string; name: string; opportunities: CrmOpportunity[] }
    >();
    for (const opportunity of opportunities) {
      const id =
        groupBy === "salesman" ? opportunity.ownerId : opportunity.customerId;
      const name =
        groupBy === "salesman"
          ? opportunity.ownerName
          : opportunity.customerName;
      if (!id) continue;
      const current = grouped.get(id) ?? {
        id,
        name: name || id,
        opportunities: [],
      };
      current.opportunities.push(opportunity);
      grouped.set(id, current);
    }
    for (const group of grouped.values()) {
      const ids = new Set(group.opportunities.map((row) => row.opportunityId));
      groups.push({
        id: group.id,
        name: group.name,
        metrics: summarize({
          opportunities: group.opportunities,
          products: filteredProducts.filter((row) =>
            ids.has(row.opportunityId),
          ),
          partials: filteredPartials.filter((row) =>
            ids.has(row.opportunityId),
          ),
        }),
      });
    }
  }
  if (groupBy === "product") {
    const productMap = new Map<
      string,
      { productId: string | null; productName: string }
    >();
    for (const row of [...products, ...partials]) {
      if (!row.productName) continue;
      const key = row.productId ?? row.productName;
      productMap.set(key, {
        productId: row.productId,
        productName: row.productName,
      });
    }
    for (const product of productMap.values()) {
      groups.push({
        id: product.productId,
        name: product.productName,
        metrics: summarizeProductGroup({
          ...product,
          opportunities,
          products,
          partials,
          operations,
          metrics,
          from: filters.from,
          to: filters.to,
          opportunityDateField: input.opportunityDateField,
        }),
      });
    }
  }
  const totalGroupsBeforeLimit = groups.length;
  const rankedGroups = rankGroups(groups, input);

  return {
    filters,
    groupBy,
    metrics,
    sortBy: input.sortBy ?? null,
    sortDirection: input.sortDirection ?? "desc",
    limit: input.limit ?? null,
    totalMatchedOpportunities: opportunities.length,
    totalGroupsBeforeLimit,
    summary,
    groups: rankedGroups,
  };
}
