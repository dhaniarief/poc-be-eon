import { finopsGet } from "./finops-client.js";
import type { FinOpsItemResolution } from "../../../domain/item.types.js";
import { escapeODataString } from "../../../utils/odata.util.js";
import { normalizeText, uniqueParts } from "../../../utils/text.util.js";

export function buildFinopsProductName(productName: string, uom: string) {
  return `${normalizeText(productName)} ${normalizeText(uom)}`
    .replace(/\bliter\b/gi, "Ltr")
    .replace(/\s+/g, " ")
    .trim();
}

function unresolved(
  status: Exclude<FinOpsItemResolution["status"], "RESOLVED">,
  base: Omit<FinOpsItemResolution, "status">,
): FinOpsItemResolution {
  return { status, ...base };
}

export async function resolveFinOpsItem(
  productName: string,
  uom: string,
): Promise<FinOpsItemResolution> {
  const normalizedProductName = normalizeText(productName);
  const normalizedUom = normalizeText(uom);
  const finopsProductName = buildFinopsProductName(
    normalizedProductName,
    normalizedUom,
  );

  const base = {
    productName: normalizedProductName,
    uom: normalizedUom,
    finopsProductName,
    productNumber: null,
    itemNumber: null,
  } satisfies Omit<FinOpsItemResolution, "status">;

  if (!normalizedProductName || !normalizedUom || !finopsProductName) {
    return unresolved("INVALID_SOURCE_PRODUCT", base);
  }

  const products = await finopsGet<{
    value: Array<{ ProductNumber?: string }>;
  }>("ProductsV2", {
    $select: "ProductNumber",
    $filter: `ProductName eq '${escapeODataString(finopsProductName)}'`,
  });

  if (products.value.length === 0) {
    return unresolved("PRODUCT_NOT_FOUND", base);
  }

  const productNumbers = uniqueParts(
    products.value.map((row) => row.ProductNumber),
  );

  if (productNumbers.length === 0) {
    return unresolved("PRODUCT_NUMBER_NOT_FOUND", base);
  }

  if (productNumbers.length > 1) {
    return unresolved("AMBIGUOUS_PRODUCT_NAME", base);
  }

  const productNumber = productNumbers[0];

  const released = await finopsGet<{
    value: Array<{ ItemNumber?: string }>;
  }>("ReleasedProductsV2", {
    $select: "ItemNumber",
    $filter:
      `dataAreaId eq 'ecp' ` +
      `and ProductNumber eq '${escapeODataString(productNumber)}'`,
  });

  const withProductNumber = {
    ...base,
    productNumber,
  };

  if (released.value.length === 0) {
    return unresolved("ITEM_NOT_RELEASED", withProductNumber);
  }

  const itemNumbers = uniqueParts(released.value.map((row) => row.ItemNumber));

  if (itemNumbers.length === 0) {
    return unresolved("ITEM_NUMBER_NOT_FOUND", withProductNumber);
  }

  if (itemNumbers.length > 1) {
    return unresolved("AMBIGUOUS_ITEM_NUMBER", withProductNumber);
  }

  return {
    status: "RESOLVED",
    productName: normalizedProductName,
    uom: normalizedUom,
    finopsProductName,
    productNumber,
    itemNumber: itemNumbers[0],
  };
}

/** Backward-compatible convenience wrapper. */
export async function resolveItemNumber(productName: string, uom: string) {
  const result = await resolveFinOpsItem(productName, uom);
  return result.itemNumber;
}
