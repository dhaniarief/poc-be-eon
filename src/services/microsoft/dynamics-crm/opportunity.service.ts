import { dynamicsGet } from "./crm-client.js";
import { escapeODataString } from "../../../utils/odata.util.js";

export type CrmGetter = <T>(endpoint: string) => Promise<T>;

type OpportunityResponse = {
  value: Array<{
    opportunityid: string;
    name?: string;
    new_noopp?: string;
    new_warehouse?: number | string | null;
    "new_warehouse@OData.Community.Display.V1.FormattedValue"?: string;
    new_productfamily2?: number | string | null;
    "new_productfamily2@OData.Community.Display.V1.FormattedValue"?: string;
    "statuscode@OData.Community.Display.V1.FormattedValue"?: string;
    "msdyn_forecastcategory@OData.Community.Display.V1.FormattedValue"?: string;
    "_customerid_value@OData.Community.Display.V1.FormattedValue"?: string;
    "_ownerid_value@OData.Community.Display.V1.FormattedValue"?: string;
    "_new_destinationid_value@OData.Community.Display.V1.FormattedValue"?: string;
  }>;
};

type OpportunityProductResponse = {
  value: Array<{
    opportunityproductid?: string;
    opportunityproductname?: string;
    productname?: string;
    new_uom?: string;
    quantity?: number;
    priceperunit?: number;
    extendedamount?: number;
    new_disc?: number;
  }>;
};

type OpportunityActivityResponse = {
  value: Array<{
    activityid?: string;
    subject?: string;
    description?: string;
    activitytypecode?: string;
    createdon?: string;
    scheduledstart?: string;
    scheduledend?: string;
    "statecode@OData.Community.Display.V1.FormattedValue"?: string;
    "_ownerid_value@OData.Community.Display.V1.FormattedValue"?: string;
  }>;
};

type OpportunityStageResponse = {
  value: Array<{
    opportunityid?: string;
    new_noopp?: string;
    name?: string;
    stepname?: string;
    new_opstages?: number | null;
    "new_opstages@OData.Community.Display.V1.FormattedValue"?: string;
    salesstage?: number | null;
    "salesstage@OData.Community.Display.V1.FormattedValue"?: string;
    salesstagecode?: number | null;
    "salesstagecode@OData.Community.Display.V1.FormattedValue"?: string;
    statecode?: number | null;
    "statecode@OData.Community.Display.V1.FormattedValue"?: string;
    statuscode?: number | null;
    "statuscode@OData.Community.Display.V1.FormattedValue"?: string;
    msdyn_forecastcategory?: number | null;
    "msdyn_forecastcategory@OData.Community.Display.V1.FormattedValue"?: string;
    new_soscverified?: number | null;
    "new_soscverified@OData.Community.Display.V1.FormattedValue"?: string;
    new_soadminverified?: number | null;
    "new_soadminverified@OData.Community.Display.V1.FormattedValue"?: string;
    new_purchasedorder?: boolean | null;
    "new_purchasedorder@OData.Community.Display.V1.FormattedValue"?: string;
    new_ppicstatus?: number | null;
    "new_ppicstatus@OData.Community.Display.V1.FormattedValue"?: string;
    new_ppicnote?: string | null;
  }>;
};

function mapOpportunityOverview(row: OpportunityResponse["value"][number]) {
  return {
    opportunityId: row.opportunityid,
    opportunityName: row.name ?? "",
    noOpp: row.new_noopp ?? "",
    customer:
      row["_customerid_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    owner:
      row["_ownerid_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    status: row["statuscode@OData.Community.Display.V1.FormattedValue"] ?? "",
    warehouse:
      row["new_warehouse@OData.Community.Display.V1.FormattedValue"] ??
      String(row.new_warehouse ?? ""),
    destination:
      row[
        "_new_destinationid_value@OData.Community.Display.V1.FormattedValue"
      ] ?? "",
    productFamily:
      row["new_productfamily2@OData.Community.Display.V1.FormattedValue"] ??
      String(row.new_productfamily2 ?? ""),
    forecastCategory:
      row["msdyn_forecastcategory@OData.Community.Display.V1.FormattedValue"] ??
      "",
  };
}

function mapOpportunityProduct(
  row: OpportunityProductResponse["value"][number],
) {
  return {
    name: row.productname ?? row.opportunityproductname ?? "",
    quantity: row.quantity ?? 0,
    uom: row.new_uom ?? "",
    price: row.priceperunit ?? 0,
    amount: row.extendedamount ?? 0,
    discount: row.new_disc ?? 0,
  };
}

function mapOpportunityActivity(
  row: OpportunityActivityResponse["value"][number],
) {
  return {
    subject: row.subject ?? "",
    owner:
      row["_ownerid_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    status: row["statecode@OData.Community.Display.V1.FormattedValue"] ?? "",
    startDate: row.scheduledstart ?? row.createdon ?? "",
  };
}

function mapOpportunityStage(
  row: OpportunityStageResponse["value"][number],
  opportunityId: string,
) {
  return {
    opportunityId: row.opportunityid ?? opportunityId,
    noOpp: row.new_noopp ?? "",
    name: row.name ?? "",
    process: {
      stepName: row.stepname ?? "",
      opportunityStage:
        row["new_opstages@OData.Community.Display.V1.FormattedValue"] ?? "",
      salesStage:
        row["salesstage@OData.Community.Display.V1.FormattedValue"] ?? "",
      salesStageCode:
        row["salesstagecode@OData.Community.Display.V1.FormattedValue"] ?? "",
    },
    status: {
      state: row["statecode@OData.Community.Display.V1.FormattedValue"] ?? "",
      status: row["statuscode@OData.Community.Display.V1.FormattedValue"] ?? "",
      forecastCategory:
        row[
          "msdyn_forecastcategory@OData.Community.Display.V1.FormattedValue"
        ] ?? "",
    },
    orderReadiness: {
      purchaseOrder:
        row["new_purchasedorder@OData.Community.Display.V1.FormattedValue"] ??
        (row.new_purchasedorder === true
          ? "Yes"
          : row.new_purchasedorder === false
            ? "No"
            : ""),
      salesCoordinatorVerified:
        row["new_soscverified@OData.Community.Display.V1.FormattedValue"] ?? "",
      adminVerified:
        row["new_soadminverified@OData.Community.Display.V1.FormattedValue"] ??
        "",
      ppicStatus:
        row["new_ppicstatus@OData.Community.Display.V1.FormattedValue"] ?? "",
      ppicNote: row.new_ppicnote ?? "",
    },
  };
}

export async function getOpportunityOverview(
  opportunityId: string,
  crmGet: CrmGetter = dynamicsGet,
) {
  const data = await crmGet<OpportunityResponse>(
    `/api/data/v9.2/opportunities?$select=${[
      "opportunityid",
      "name",
      "new_noopp",
      "new_warehouse",
      "new_productfamily2",
      "msdyn_forecastcategory",
      "statuscode",
      "_customerid_value",
      "_ownerid_value",
      "_new_destinationid_value",
    ].join(",")}&$filter=opportunityid eq ${opportunityId}`,
  );
  const row = data.value[0];
  if (!row) throw new Error(`Opportunity ${opportunityId} not found`);
  return mapOpportunityOverview(row);
}

export async function getOpportunityProducts(
  opportunityId: string,
  crmGet: CrmGetter = dynamicsGet,
) {
  const data = await crmGet<OpportunityProductResponse>(
    `/api/data/v9.2/opportunityproducts?$select=${[
      "opportunityproductid",
      "opportunityproductname",
      "productname",
      "new_uom",
      "quantity",
      "priceperunit",
      "extendedamount",
      "new_disc",
    ].join(",")}&$filter=_opportunityid_value eq ${opportunityId}`,
  );
  return { products: data.value.map(mapOpportunityProduct) };
}

export async function getOpportunityActivities(
  opportunityId: string,
  crmGet: CrmGetter = dynamicsGet,
) {
  const data = await crmGet<OpportunityActivityResponse>(
    `/api/data/v9.2/activitypointers?$select=${[
      "activityid",
      "subject",
      "description",
      "activitytypecode",
      "createdon",
      "scheduledstart",
      "scheduledend",
      "statecode",
      "_ownerid_value",
    ].join(
      ",",
    )}&$filter=_regardingobjectid_value eq ${opportunityId}&$orderby=createdon desc&$top=10`,
  );
  return { activities: data.value.map(mapOpportunityActivity) };
}

export async function getOpportunityStage(
  opportunityId: string,
  crmGet: CrmGetter = dynamicsGet,
) {
  const data = await crmGet<OpportunityStageResponse>(
    `/api/data/v9.2/opportunities?$select=${[
      "opportunityid",
      "new_noopp",
      "name",
      "stepname",
      "new_opstages",
      "salesstage",
      "salesstagecode",
      "statecode",
      "statuscode",
      "msdyn_forecastcategory",
      "new_soscverified",
      "new_soadminverified",
      "new_purchasedorder",
      "new_ppicstatus",
      "new_ppicnote",
    ].join(",")}&$filter=opportunityid eq ${opportunityId}`,
  );
  const row = data.value[0];
  if (!row) throw new Error(`Opportunity not found: ${opportunityId}`);
  return mapOpportunityStage(row, opportunityId);
}

export async function findOpportunityByNo(
  opportunityNo: string,
  crmGet: CrmGetter = dynamicsGet,
) {
  const normalizedOpportunityNo = opportunityNo.trim();

  if (!normalizedOpportunityNo) {
    throw new Error("Opportunity number is required.");
  }

  const escapedOpportunityNo = escapeODataString(normalizedOpportunityNo);

  const data = await crmGet<OpportunityResponse>(
    `/api/data/v9.2/opportunities?$select=${[
      "opportunityid",
      "name",
      "new_noopp",
      "new_warehouse",
      "new_productfamily2",
      "msdyn_forecastcategory",
      "statuscode",
      "_customerid_value",
      "_ownerid_value",
      "_new_destinationid_value",
    ].join(",")}&$filter=new_noopp eq '${escapedOpportunityNo}'&$top=1`,
  );

  const row = data.value[0];

  if (!row) {
    return null;
  }

  return mapOpportunityOverview(row);
}
