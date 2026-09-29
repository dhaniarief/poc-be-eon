import { getResolvedOpportunityItems } from "../dynamics-finops/opportunity-item.service.js";
import type { ResolvedOpportunityItem } from "../../../domain/item.types.js";
import {
  findMsdsByItemNumbers,
  type MsdsLookupResult,
} from "./msds.service.js";

type MsdsDependencies = {
  findMsdsBatch: (
    itemNumbers: string[],
  ) => Promise<Record<string, MsdsLookupResult>>;
};

const defaultDeps: MsdsDependencies = {
  findMsdsBatch: findMsdsByItemNumbers,
};

export async function getOpportunityMsdsFromResolvedItems(
  opportunityId: string,
  items: ResolvedOpportunityItem[],
  deps: MsdsDependencies = defaultDeps,
) {
  const itemNumbers = Array.from(
    new Set(
      items
        .filter((item) => item.status === "RESOLVED" && item.itemNumber)
        .map((item) => String(item.itemNumber).trim().toUpperCase()),
    ),
  );

  const msdsByItem = await deps.findMsdsBatch(itemNumbers);

  const products = items.map((item) => {
    if (item.status !== "RESOLVED" || !item.itemNumber) {
      return {
        productName: item.productName,
        uom: item.uom,
        quantity: item.requestedQuantity,
        productNumber: item.productNumber,
        itemNumber: null,
        mappingStatus: item.status,
        msdsFound: false,
        totalDocuments: 0,
        documents: [],
        status: "ITEM_NOT_FOUND" as const,
      };
    }

    const code = String(item.itemNumber).trim().toUpperCase();
    const msds = msdsByItem[code] ?? {
      found: false,
      itemNumber: code,
      totalDocuments: 0,
      documents: [],
    };

    return {
      productName: item.productName,
      uom: item.uom,
      quantity: item.requestedQuantity,
      productNumber: item.productNumber,
      itemNumber: item.itemNumber,
      mappingStatus: item.status,
      msdsFound: msds.found,
      totalDocuments: msds.totalDocuments,
      documents: msds.documents,
      status: msds.found ? ("FOUND" as const) : ("MSDS_NOT_FOUND" as const),
    };
  });

  return {
    opportunityId,
    summary: {
      totalProducts: products.length,
      msdsFound: products.filter((item) => item.status === "FOUND").length,
      msdsNotFound: products.filter((item) => item.status === "MSDS_NOT_FOUND")
        .length,
      itemNotFound: products.filter((item) => item.status === "ITEM_NOT_FOUND")
        .length,
    },
    products,
  };
}

export async function getOpportunityMsds(opportunityId: string) {
  const resolved = await getResolvedOpportunityItems(opportunityId);
  return getOpportunityMsdsFromResolvedItems(opportunityId, resolved.items);
}
