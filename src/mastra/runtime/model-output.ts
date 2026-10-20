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

function compactKnowledgeResult(result: unknown) {
  const value = asRecord(result);

  return {
    found: value.found ?? false,
    query: value.query ?? "",
    totalResults: value.totalResults ?? 0,
    results: asArray(value.results).map((item) =>
      pick(item, [
        "score",
        "title",
        "category",
        "productName",
        "industryTypes",
        "applications",
        "equipment",
        "content",
        "sourceUrl",
        "sourceModifiedAt",
      ]),
    ),
  };
}

export function compactToolResult(toolName: string, result: unknown): unknown {
  const value = asRecord(result);

  switch (toolName) {
    case "sales.resolve_entity":
      return {
        ...pick(result, ["type", "query", "found", "exact"]),
        candidates: asArray(value.candidates).map((item) =>
          pick(item, ["id", "name", "code", "active"]),
        ),
      };

    case "sales.get_opportunity": {
      const operations = asRecord(value.operations);
      return {
        opportunity: value.opportunity ?? null,
        revenue: value.revenue ?? null,
        products: value.products ?? [],
        partials: value.partials ?? [],
        activities: asArray(value.activities).slice(0, 10),
        operations: value.operations
          ? {
              summary: operations.summary ?? null,
              salesOrders: operations.salesOrders ?? [],
              deliveries: operations.deliveries ?? [],
              invoices: operations.invoices ?? [],
            }
          : null,
        stock: value.stock ?? [],
        msds: value.msds ?? [],
        warnings: value.warnings ?? [],
      };
    }

    case "sales.query":
    case "sales.check_stock":
    case "sales.get_msds":
      return result;

    case "knowledge.search":
    case "le-mining.knowledge":
      return compactKnowledgeResult(result);

    case "le-mining.products":
      return {
        found: value.found ?? false,
        query: value.query ?? "",
        scope: value.scope ?? null,
        totalEligible: value.totalEligible ?? 0,
        totalMatched: value.totalMatched ?? 0,
        returned: value.returned ?? 0,
        products: asArray(value.products).map((item) =>
          pick(item, [
            "name",
            "productNumber",
            "description",
            "industryLabels",
          ]),
        ),
      };

    case "web.search":
    case "le-mining.web":
      return {
        query: value.query ?? "",
        allowedDomains: value.allowedDomains ?? undefined,
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
