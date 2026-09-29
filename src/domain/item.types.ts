export type ItemResolutionStatus =
  | "RESOLVED"
  | "INVALID_SOURCE_PRODUCT"
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_NUMBER_NOT_FOUND"
  | "AMBIGUOUS_PRODUCT_NAME"
  | "ITEM_NOT_RELEASED"
  | "ITEM_NUMBER_NOT_FOUND"
  | "AMBIGUOUS_ITEM_NUMBER";

export type FinOpsItemResolution = {
  status: ItemResolutionStatus;
  productName: string;
  uom: string;
  finopsProductName: string;
  productNumber: string | null;
  itemNumber: string | null;
};

export type ResolvedOpportunityItem = FinOpsItemResolution & {
  opportunityProductId: string | null;
  requestedQuantity: number;
};
