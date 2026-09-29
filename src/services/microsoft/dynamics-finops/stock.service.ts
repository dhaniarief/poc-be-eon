import { finopsGet } from "./finops-client.js";
import { getOpportunityInventorySite } from "./opportunity-context.service.js";
import { getResolvedOpportunityItems } from "./opportunity-item.service.js";
import type { ResolvedOpportunityItem } from "../../../domain/item.types.js";
import { escapeODataString } from "../../../utils/odata.util.js";

type InventoryRow = {
  ItemNumber?: string;
  ProductName?: string;
  InventorySiteId?: string;
  AvailableOnHandQuantity?: number;
};

type InventoryResponse = {
  value: InventoryRow[];
};

type StockDependencies = {
  getWarehouse: typeof getOpportunityInventorySite;
  getInventory: (itemNumbers: string[], warehouse: string) => Promise<InventoryRow[]>;
};

async function getInventoryBatch(
  itemNumbers: string[],
  warehouse: string,
): Promise<InventoryRow[]> {
  if (itemNumbers.length === 0) return [];

  const itemFilter = itemNumbers
    .map((itemNumber) => `ItemNumber eq '${escapeODataString(itemNumber)}'`)
    .join(" or ");

  const stock = await finopsGet<InventoryResponse>("InventorySitesOnHandV2", {
    $select: [
      "ItemNumber",
      "ProductName",
      "InventorySiteId",
      "AvailableOnHandQuantity",
    ].join(","),
    $filter:
      `(${itemFilter}) and ` +
      `InventorySiteId eq '${escapeODataString(warehouse)}'`,
  });

  return stock.value;
}

const defaultDeps: StockDependencies = {
  getWarehouse: getOpportunityInventorySite,
  getInventory: getInventoryBatch,
};

export async function checkOpportunityStockFromResolvedItems(
  opportunityId: string,
  items: ResolvedOpportunityItem[],
  deps: StockDependencies = defaultDeps,
) {
  const warehouse = await deps.getWarehouse(opportunityId);

  const resolvedItemNumbers = Array.from(
    new Set(
      items
        .filter((item) => item.status === "RESOLVED" && item.itemNumber)
        .map((item) => item.itemNumber as string),
    ),
  );

  const inventoryRows = await deps.getInventory(resolvedItemNumbers, warehouse);
  const inventoryByItem = new Map<string, InventoryRow>();

  for (const row of inventoryRows) {
    if (row.ItemNumber && !inventoryByItem.has(row.ItemNumber)) {
      inventoryByItem.set(row.ItemNumber, row);
    }
  }

  const stockItems = items.map((item) => {
    if (item.status !== "RESOLVED" || !item.itemNumber) {
      return {
        ...item,
        warehouse,
        available: null,
        stockStatus: "UNRESOLVED_ITEM" as const,
      };
    }

    const row = inventoryByItem.get(item.itemNumber);
    const available = Number(row?.AvailableOnHandQuantity ?? 0);

    return {
      ...item,
      warehouse,
      available,
      stockStatus:
        available >= item.requestedQuantity
          ? ("SUFFICIENT" as const)
          : ("SHORTAGE" as const),
    };
  });

  return {
    warehouse,
    summary: {
      total: stockItems.length,
      sufficient: stockItems.filter((item) => item.stockStatus === "SUFFICIENT")
        .length,
      shortage: stockItems.filter((item) => item.stockStatus === "SHORTAGE")
        .length,
      unresolved: stockItems.filter(
        (item) => item.stockStatus === "UNRESOLVED_ITEM",
      ).length,
    },
    items: stockItems,
  };
}

export async function checkOpportunityStock(opportunityId: string) {
  const resolved = await getResolvedOpportunityItems(opportunityId);
  return checkOpportunityStockFromResolvedItems(opportunityId, resolved.items);
}
