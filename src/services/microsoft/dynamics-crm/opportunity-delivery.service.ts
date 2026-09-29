import type { CRMOpportunityDeliverySource } from "../../../domain/delivery.types.js";
import { dynamicsGet } from "./crm-client.js";

export async function getOpportunityDeliveryData(
  opportunityId: string,
): Promise<CRMOpportunityDeliverySource> {
  const data = await dynamicsGet<{ value: CRMOpportunityDeliverySource[] }>(
    `/api/data/v9.2/opportunities` +
      `?$select=` +
      [
        "opportunityid",
        "new_noopp",
        "new_deliverypointharussamadenganygdisordelive",
        "new_shippingaddress",
        "_new_destinationid_value",
        "new_regencyxd",
        "new_zona",
      ].join(",") +
      `&$filter=opportunityid eq ${opportunityId}`,
  );

  const opportunity = data.value[0];

  if (!opportunity) {
    throw new Error(`Opportunity not found: ${opportunityId}`);
  }

  return opportunity;
}
