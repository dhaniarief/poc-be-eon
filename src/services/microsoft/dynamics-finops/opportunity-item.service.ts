import { dynamicsGet } from "../dynamics-crm/crm-client.js";
import { resolveFinOpsItem } from "./item-resolver.service.js";
import type {
  FinOpsItemResolution,
  ResolvedOpportunityItem,
} from "../../../domain/item.types.js";
import { normalizeText } from "../../../utils/text.util.js";

export type OpportunityProductSource = {
  opportunityproductid?: string;
  opportunityproductname?: string;
  productname?: string;
  new_uom?: string;
  quantity?: number;
};

type OpportunityProductResponse = {
  value: OpportunityProductSource[];
};

export async function mapOpportunityProductsWithResolver(
  products: OpportunityProductSource[],
  resolver: (
    productName: string,
    uom: string,
  ) => Promise<FinOpsItemResolution> = resolveFinOpsItem,
): Promise<ResolvedOpportunityItem[]> {
  return await Promise.all(
    products.map(async (product) => {
      const productName = normalizeText(
        product.productname ?? product.opportunityproductname,
      );
      const uom = normalizeText(product.new_uom);
      const resolution = await resolver(productName, uom);

      return {
        ...resolution,
        opportunityProductId:
          normalizeText(product.opportunityproductid) || null,
        requestedQuantity: Number(product.quantity ?? 0),
      };
    }),
  );
}

export async function getResolvedOpportunityItems(opportunityId: string) {
  const data = await dynamicsGet<OpportunityProductResponse>(
    `/api/data/v9.2/opportunityproducts` +
      `?$select=` +
      [
        "opportunityproductid",
        "opportunityproductname",
        "productname",
        "new_uom",
        "quantity",
      ].join(",") +
      `&$filter=_opportunityid_value eq ${opportunityId}`,
  );

  const items = await mapOpportunityProductsWithResolver(data.value);

  return {
    opportunityId,
    summary: {
      total: items.length,
      resolved: items.filter((item) => item.status === "RESOLVED").length,
      unresolved: items.filter((item) => item.status !== "RESOLVED").length,
    },
    items,
  };
}
