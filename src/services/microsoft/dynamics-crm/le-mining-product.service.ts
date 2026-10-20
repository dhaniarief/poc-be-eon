import { dynamicsGetAll } from "./crm-client.js";

export const LE_PRODUCT_FAMILY_VALUE = 100000021;
export const ACTIVE_STATE_CODE = 0;
export const MINING_EAST_VALUE = 100000002;
export const MINING_WEST_VALUE = 100000003;

export const MINING_INDUSTRY_VALUES = [
  MINING_EAST_VALUE,
  MINING_WEST_VALUE,
] as const;

export const MINING_INDUSTRY_LABELS: Record<number, string> = {
  [MINING_EAST_VALUE]: "Mining East",
  [MINING_WEST_VALUE]: "Mining West",
};

type ProductRow = {
  productid?: string;
  name?: string;
  productnumber?: string;
  description?: string | null;
  new_productfamily?: number | null;
  new_industryproduct?: string | number | null;
  statecode?: number | null;
  statuscode?: number | null;
  _defaultuomid_value?: string | null;
  _defaultuomscheduleid_value?: string | null;
};

export type LeMiningProduct = {
  productId: string;
  name: string;
  productNumber: string;
  description: string | null;
  productFamilyValue: number;
  stateCode: number;
  statusCode: number | null;
  industryValues: number[];
  industryLabels: string[];
  defaultUomId: string | null;
  defaultUomScheduleId: string | null;
};

export type LeMiningProductSearchResult = {
  found: boolean;
  query: string;
  scope: {
    productFamilyValue: number;
    stateCode: number;
    industryValues: number[];
    industryLabels: string[];
  };
  totalEligible: number;
  totalMatched: number;
  returned: number;
  products: LeMiningProduct[];
};

function normalizeWhitespace(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function normalizeSearchText(value: unknown) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalizeSearchText(value)
    .split(" ")
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

function parseIndustryValues(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value
      .map(Number)
      .filter((item) => Number.isInteger(item));
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? [value] : [];
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item));
  }

  return [];
}

function hasMiningIndustry(values: number[]) {
  return values.some((value) =>
    MINING_INDUSTRY_VALUES.includes(
      value as (typeof MINING_INDUSTRY_VALUES)[number],
    ),
  );
}

function isEligibleRow(row: ProductRow) {
  const industries = parseIndustryValues(row.new_industryproduct);

  return (
    row.new_productfamily === LE_PRODUCT_FAMILY_VALUE &&
    row.statecode === ACTIVE_STATE_CODE &&
    hasMiningIndustry(industries)
  );
}

function mapProduct(row: ProductRow): LeMiningProduct {
  const industryValues = parseIndustryValues(row.new_industryproduct).filter(
    (value) =>
      MINING_INDUSTRY_VALUES.includes(
        value as (typeof MINING_INDUSTRY_VALUES)[number],
      ),
  );

  return {
    productId: normalizeWhitespace(row.productid),
    name: normalizeWhitespace(row.name),
    productNumber: normalizeWhitespace(row.productnumber),
    description: normalizeWhitespace(row.description) || null,
    productFamilyValue: Number(row.new_productfamily ?? LE_PRODUCT_FAMILY_VALUE),
    stateCode: Number(row.statecode ?? ACTIVE_STATE_CODE),
    statusCode:
      row.statuscode === null || row.statuscode === undefined
        ? null
        : Number(row.statuscode),
    industryValues,
    industryLabels: industryValues
      .map((value) => MINING_INDUSTRY_LABELS[value])
      .filter((value): value is string => Boolean(value)),
    defaultUomId: normalizeWhitespace(row._defaultuomid_value) || null,
    defaultUomScheduleId:
      normalizeWhitespace(row._defaultuomscheduleid_value) || null,
  };
}

function productScore(product: LeMiningProduct, rawQuery: string) {
  const query = normalizeSearchText(rawQuery);
  if (!query) return 1;

  const name = normalizeSearchText(product.name);
  const code = normalizeSearchText(product.productNumber);
  const description = normalizeSearchText(product.description ?? "");

  if (name === query || code === query) return 100;

  let score = 0;

  if (name.startsWith(query)) score += 70;
  else if (name.includes(query)) score += 55;

  if (code.startsWith(query)) score += 65;
  else if (code.includes(query)) score += 50;

  if (description.includes(query)) score += 35;

  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length > 0) {
    const combined = `${name} ${code} ${description}`;
    const matched = queryTokens.filter((token) => combined.includes(token));
    score += (matched.length / queryTokens.length) * 40;
  }

  return score;
}

async function queryEligibleProducts(signal?: AbortSignal) {
  // Keep the OData query simple and reliable, then enforce Mining again in code.
  // This means the final service cannot accidentally return non-LE, inactive,
  // or non-Mining products even if the API query is changed later.
  const select = [
    "productid",
    "name",
    "productnumber",
    "description",
    "new_productfamily",
    "new_industryproduct",
    "statecode",
    "statuscode",
    "_defaultuomid_value",
    "_defaultuomscheduleid_value",
  ].join(",");

  const filter = [
    `new_productfamily eq ${LE_PRODUCT_FAMILY_VALUE}`,
    `statecode eq ${ACTIVE_STATE_CODE}`,
  ].join(" and ");

  const endpoint =
    `/api/data/v9.2/products` +
    `?$select=${select}` +
    `&$filter=${encodeURIComponent(filter)}` +
    `&$orderby=${encodeURIComponent("name asc")}`;

  const rows = await dynamicsGetAll<ProductRow>(endpoint, { signal });

  return rows
    .filter(isEligibleRow)
    .map(mapProduct)
    .filter((item) => item.name && item.productNumber);
}

export async function searchLeMiningProducts(input: {
  query?: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<LeMiningProductSearchResult> {
  const query = input.query?.trim() ?? "";
  const limit = Math.max(1, Math.min(input.limit ?? 10, 50));

  const eligible = await queryEligibleProducts(input.signal);

  const ranked = eligible
    .map((product) => ({
      product,
      score: productScore(product, query),
    }))
    .filter((item) => !query || item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.product.name.localeCompare(b.product.name);
    });

  const products = ranked.slice(0, limit).map((item) => item.product);

  return {
    found: products.length > 0,
    query,
    scope: {
      productFamilyValue: LE_PRODUCT_FAMILY_VALUE,
      stateCode: ACTIVE_STATE_CODE,
      industryValues: [...MINING_INDUSTRY_VALUES],
      industryLabels: MINING_INDUSTRY_VALUES.map(
        (value) => MINING_INDUSTRY_LABELS[value] ?? String(value),
      ),
    },
    totalEligible: eligible.length,
    totalMatched: ranked.length,
    returned: products.length,
    products,
  };
}
