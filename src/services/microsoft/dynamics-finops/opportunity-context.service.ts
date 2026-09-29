import { dynamicsGet } from "../dynamics-crm/crm-client.js";
import { normalizeText } from "../../../utils/text.util.js";

type CRMOpportunityWarehouseResponse = {
  value: Array<{
    new_warehouse?: string | number | null;
    "new_warehouse@OData.Community.Display.V1.FormattedValue"?: string;
  }>;
};

export async function getOpportunityInventorySite(opportunityId: string) {
  const data = await dynamicsGet<CRMOpportunityWarehouseResponse>(
    `/api/data/v9.2/opportunities` +
      `?$select=new_warehouse` +
      `&$filter=opportunityid eq ${opportunityId}`,
  );

  const opportunity = data.value[0];

  return normalizeText(
    opportunity?.[
      "new_warehouse@OData.Community.Display.V1.FormattedValue"
    ] ?? opportunity?.new_warehouse,
  );
}
