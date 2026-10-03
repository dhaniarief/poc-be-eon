import { dynamicsGet, dynamicsGetAll } from "./crm-client.js";
import { escapeODataString } from "../../../utils/odata.util.js";
import { normalizeText } from "../../../utils/text.util.js";

export const SALES_ENTITY_TYPES = [
  "salesman",
  "customer",
  "product",
  "opportunity",
  "uom",
] as const;

export type SalesEntityType = (typeof SALES_ENTITY_TYPES)[number];

export type EntityCandidate = {
  type: SalesEntityType;
  id: string;
  name: string;
  code?: string;
  active?: boolean;
};

export type CrmOpportunity = {
  opportunityId: string;
  noOpp: string;
  name: string;
  ownerId: string | null;
  ownerName: string;
  customerId: string | null;
  customerName: string;
  createdOn: string | null;
  estimatedCloseDate: string | null;
  actualCloseDate: string | null;
  estimatedValue: number;
  actualValue: number;
  stateCode: number | null;
  statusCode: number | null;
  state: string;
  status: string;
  warehouse: string;
  warehouseValue: number | string | null;
  productFamily: string;
  forecastCategory: string;
  destination: string;
  stepName: string;
  opportunityStage: string;
  salesStage: string;
  salesStageCode: string;
  purchaseOrder: boolean | null;
  salesCoordinatorVerified: string;
  adminVerified: string;
  ppicStatus: string;
  ppicNote: string;
  currencyId: string | null;
  currency: string;
};

export type CrmOpportunityProduct = {
  opportunityProductId: string;
  opportunityId: string;
  productId: string | null;
  productName: string;
  uomId: string | null;
  uomName: string;
  quantity: number;
  pricePerUnit: number;
  extendedAmount: number;
  discount: number;
  createdOn: string | null;
};

export type CrmOpportunityPartial = {
  partialId: string;
  opportunityId: string;
  opportunityNo: string;
  ownerId: string | null;
  productId: string | null;
  productName: string;
  uomId: string | null;
  uomName: string;
  quantity: number;
  pricePerUnit: number;
  amount: number;
  extendedAmount: number;
  actualCloseDate: string | null;
  createdOn: string | null;
  ppicVerified: number | null;
  adminVerified: number | null;
};

export type CrmProduct = {
  productId: string;
  name: string;
  productNumber: string;
  defaultUomId: string | null;
  uomScheduleId: string | null;
  active: boolean;
};

export type CrmUom = {
  uomId: string;
  name: string;
  uomScheduleId: string | null;
};

export type CrmOpportunityActualRevenueEvent = {
  opportunityId: string;
  noOpp: string;
  name: string;
  customerId: string | null;
  ownerId: string | null;
  stateCode: number | null;
  actualValue: number;
  actualCloseDate: string | null;
};

export type CrmPartialRevenueEvent = {
  partialId: string;
  opportunityId: string;
  opportunityNo: string;
  customerId: string | null;
  ownerId: string | null;
  productId: string | null;
  productName: string;
  extendedAmount: number;
  actualCloseDate: string | null;
};

export type CrmAccountRef = {
  accountId: string;
  name: string;
};

export type CrmSystemUserRef = {
  systemUserId: string;
  name: string;
};

export type CrmOpportunityDimensionRef = {
  opportunityId: string;
  noOpp: string;
  name: string;
  customerId: string | null;
  ownerId: string | null;
};

export type CrmQueryOptions = {
  signal?: AbortSignal;
};

function throwIfCrmAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;

  if (signal.reason instanceof Error) {
    throw signal.reason;
  }

  throw new Error("CRM query aborted");
}

function nextDay(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function pushDateRangeFilters(
  filters: string[],
  field: string,
  from?: string,
  to?: string,
) {
  if (from) {
    filters.push(`${field} ge ${from}T00:00:00Z`);
  }

  if (to) {
    filters.push(`${field} lt ${nextDay(to)}T00:00:00Z`);
  }
}

type OpportunityRow = {
  opportunityid?: string;
  new_noopp?: string;
  name?: string;
  _ownerid_value?: string;
  _customerid_value?: string;
  createdon?: string;
  estimatedclosedate?: string;
  actualclosedate?: string;
  estimatedvalue?: number;
  actualvalue?: number;
  statecode?: number;
  statuscode?: number;
  new_warehouse?: number | string | null;
  new_productfamily2?: number | string | null;
  msdyn_forecastcategory?: number | string | null;
  _new_destinationid_value?: string;
  stepname?: string;
  new_opstages?: number | null;
  salesstage?: number | null;
  salesstagecode?: number | null;
  new_purchasedorder?: boolean | null;
  new_soscverified?: number | null;
  new_soadminverified?: number | null;
  new_ppicstatus?: number | null;
  new_ppicnote?: string | null;
  _transactioncurrencyid_value?: string;
  [key: string]: unknown;
};

const opportunitySelect = [
  "opportunityid",
  "new_noopp",
  "name",
  "_ownerid_value",
  "_customerid_value",
  "createdon",
  "estimatedclosedate",
  "actualclosedate",
  "estimatedvalue",
  "actualvalue",
  "statecode",
  "statuscode",
  "new_warehouse",
  "new_productfamily2",
  "msdyn_forecastcategory",
  "_new_destinationid_value",
  "stepname",
  "new_opstages",
  "salesstage",
  "salesstagecode",
  "new_purchasedorder",
  "new_soscverified",
  "new_soadminverified",
  "new_ppicstatus",
  "new_ppicnote",
  "_transactioncurrencyid_value",
].join(",");

function formatted(row: Record<string, unknown>, field: string) {
  const value = row[`${field}@OData.Community.Display.V1.FormattedValue`];
  return typeof value === "string" ? value : "";
}

function mapOpportunity(row: OpportunityRow): CrmOpportunity {
  const source = row as Record<string, unknown>;
  return {
    opportunityId: String(row.opportunityid ?? ""),
    noOpp: normalizeText(row.new_noopp),
    name: normalizeText(row.name),
    ownerId: row._ownerid_value ?? null,
    ownerName: formatted(source, "_ownerid_value"),
    customerId: row._customerid_value ?? null,
    customerName: formatted(source, "_customerid_value"),
    createdOn: row.createdon ?? null,
    estimatedCloseDate: row.estimatedclosedate ?? null,
    actualCloseDate: row.actualclosedate ?? null,
    estimatedValue: Number(row.estimatedvalue ?? 0),
    actualValue: Number(row.actualvalue ?? 0),
    stateCode: row.statecode ?? null,
    statusCode: row.statuscode ?? null,
    state: formatted(source, "statecode"),
    status: formatted(source, "statuscode"),
    warehouse:
      formatted(source, "new_warehouse") || normalizeText(row.new_warehouse),
    warehouseValue: row.new_warehouse ?? null,
    productFamily:
      formatted(source, "new_productfamily2") ||
      normalizeText(row.new_productfamily2),
    forecastCategory: formatted(source, "msdyn_forecastcategory"),
    destination: formatted(source, "_new_destinationid_value"),
    stepName: normalizeText(row.stepname),
    opportunityStage: formatted(source, "new_opstages"),
    salesStage: formatted(source, "salesstage"),
    salesStageCode: formatted(source, "salesstagecode"),
    purchaseOrder: row.new_purchasedorder ?? null,
    salesCoordinatorVerified: formatted(source, "new_soscverified"),
    adminVerified: formatted(source, "new_soadminverified"),
    ppicStatus: formatted(source, "new_ppicstatus"),
    ppicNote: normalizeText(row.new_ppicnote),
    currencyId: row._transactioncurrencyid_value ?? null,
    currency: formatted(source, "_transactioncurrencyid_value"),
  };
}

function candidateSort(query: string) {
  const needle = normalizeText(query).toLowerCase();
  return (a: EntityCandidate, b: EntityCandidate) => {
    const aExact =
      a.name.toLowerCase() === needle || a.code?.toLowerCase() === needle;
    const bExact =
      b.name.toLowerCase() === needle || b.code?.toLowerCase() === needle;
    if (aExact !== bExact) return aExact ? -1 : 1;
    if ((a.active ?? true) !== (b.active ?? true)) return a.active ? -1 : 1;
    return a.name.localeCompare(b.name);
  };
}

export async function resolveEntity(type: SalesEntityType, rawQuery: string) {
  const query = normalizeText(rawQuery);
  if (!query)
    return { type, query, found: false, exact: false, candidates: [] };

  const escaped = escapeODataString(query);
  let candidates: EntityCandidate[] = [];

  if (type === "salesman") {
    const rows = await dynamicsGetAll<{
      systemuserid?: string;
      fullname?: string;
      internalemailaddress?: string;
      isdisabled?: boolean;
    }>(
      `/api/data/v9.2/systemusers?$select=systemuserid,fullname,internalemailaddress,isdisabled&$filter=` +
        `(fullname eq '${escaped}' or contains(fullname,'${escaped}') or internalemailaddress eq '${escaped}')&$top=50`,
    );
    candidates = rows
      .filter((row) => !normalizeText(row.fullname).startsWith("#"))
      .map((row) => ({
        type,
        id: String(row.systemuserid ?? ""),
        name: normalizeText(row.fullname),
        code: normalizeText(row.internalemailaddress) || undefined,
        active: row.isdisabled !== true,
      }));
  }

  if (type === "customer") {
    const rows = await dynamicsGetAll<{
      accountid?: string;
      name?: string;
      accountnumber?: string;
      statecode?: number;
    }>(
      `/api/data/v9.2/accounts?$select=accountid,name,accountnumber,statecode&$filter=` +
        `(name eq '${escaped}' or contains(name,'${escaped}') or accountnumber eq '${escaped}')&$top=50`,
    );
    candidates = rows.map((row) => ({
      type,
      id: String(row.accountid ?? ""),
      name: normalizeText(row.name),
      code: normalizeText(row.accountnumber) || undefined,
      active: row.statecode === 0,
    }));
  }

  if (type === "product") {
    const rows = await dynamicsGetAll<{
      productid?: string;
      name?: string;
      productnumber?: string;
      statecode?: number;
    }>(
      `/api/data/v9.2/products?$select=productid,name,productnumber,statecode&$filter=` +
        `(name eq '${escaped}' or contains(name,'${escaped}') or productnumber eq '${escaped}')&$top=50`,
    );
    candidates = rows.map((row) => ({
      type,
      id: String(row.productid ?? ""),
      name: normalizeText(row.name),
      code: normalizeText(row.productnumber) || undefined,
      active: row.statecode === 0,
    }));
  }

  if (type === "opportunity") {
    const rows = await dynamicsGetAll<OpportunityRow>(
      `/api/data/v9.2/opportunities?$select=opportunityid,new_noopp,name,statecode&$filter=` +
        `(new_noopp eq '${escaped}' or name eq '${escaped}' or contains(new_noopp,'${escaped}') or contains(name,'${escaped}'))&$top=50`,
    );
    candidates = rows.map((row) => ({
      type,
      id: String(row.opportunityid ?? ""),
      name: normalizeText(row.name) || normalizeText(row.new_noopp),
      code: normalizeText(row.new_noopp) || undefined,
      active: row.statecode === 0,
    }));
  }

  if (type === "uom") {
    const rows = await dynamicsGetAll<{
      uomid?: string;
      name?: string;
    }>(
      `/api/data/v9.2/uoms?$select=uomid,name&$filter=` +
        `(name eq '${escaped}' or contains(name,'${escaped}'))&$top=100`,
    );
    candidates = rows.map((row) => ({
      type,
      id: String(row.uomid ?? ""),
      name: normalizeText(row.name),
      active: true,
    }));
  }

  candidates = candidates
    .filter((item) => item.id && item.name)
    .sort(candidateSort(query));
  const first = candidates[0];
  const exact = Boolean(
    first &&
    (first.name.toLowerCase() === query.toLowerCase() ||
      first.code?.toLowerCase() === query.toLowerCase()),
  );

  return {
    type,
    query,
    found: candidates.length > 0,
    exact,
    candidates: candidates.slice(0, 10),
  };
}

export async function getProductById(productId: string): Promise<CrmProduct> {
  const data = await dynamicsGet<{
    value: Array<{
      productid?: string;
      name?: string;
      productnumber?: string;
      _defaultuomid_value?: string;
      _defaultuomscheduleid_value?: string;
      statecode?: number;
    }>;
  }>(
    `/api/data/v9.2/products?$select=productid,name,productnumber,_defaultuomid_value,_defaultuomscheduleid_value,statecode&$filter=productid eq ${productId}&$top=1`,
  );
  const row = data.value[0];
  if (!row) throw new Error(`Product not found: ${productId}`);
  return {
    productId: String(row.productid ?? productId),
    name: normalizeText(row.name),
    productNumber: normalizeText(row.productnumber),
    defaultUomId: row._defaultuomid_value ?? null,
    uomScheduleId: row._defaultuomscheduleid_value ?? null,
    active: row.statecode === 0,
  };
}

export async function getUomById(uomId: string): Promise<CrmUom> {
  const data = await dynamicsGet<{
    value: Array<{
      uomid?: string;
      name?: string;
      _uomscheduleid_value?: string;
    }>;
  }>(
    `/api/data/v9.2/uoms?$select=uomid,name,_uomscheduleid_value&$filter=uomid eq ${uomId}&$top=1`,
  );
  const row = data.value[0];
  if (!row) throw new Error(`UOM not found: ${uomId}`);
  return {
    uomId: String(row.uomid ?? uomId),
    name: normalizeText(row.name),
    uomScheduleId: row._uomscheduleid_value ?? null,
  };
}

export async function getUomsBySchedule(
  uomScheduleId: string,
): Promise<CrmUom[]> {
  if (!uomScheduleId) return [];
  const rows = await dynamicsGetAll<{
    uomid?: string;
    name?: string;
    _uomscheduleid_value?: string;
  }>(
    `/api/data/v9.2/uoms?$select=uomid,name,_uomscheduleid_value&$filter=_uomscheduleid_value eq ${uomScheduleId}&$top=500`,
  );
  return rows
    .map((row) => ({
      uomId: String(row.uomid ?? ""),
      name: normalizeText(row.name),
      uomScheduleId: row._uomscheduleid_value ?? null,
    }))
    .filter((row) => row.uomId && row.name);
}

export async function getOpportunityById(opportunityId: string) {
  const data = await dynamicsGet<{ value: OpportunityRow[] }>(
    `/api/data/v9.2/opportunities?$select=${opportunitySelect}&$filter=opportunityid eq ${opportunityId}&$top=1`,
  );
  const row = data.value[0];
  if (!row) throw new Error(`Opportunity not found: ${opportunityId}`);
  return mapOpportunity(row);
}

export async function getOpportunityProducts(opportunityId: string) {
  const rows = await dynamicsGetAll<{
    opportunityproductid?: string;
    _opportunityid_value?: string;
    _productid_value?: string;
    _uomid_value?: string;
    opportunityproductname?: string;
    productname?: string;
    new_uom?: string;
    quantity?: number;
    priceperunit?: number;
    extendedamount?: number;
    new_disc?: number;
    createdon?: string;
    [key: string]: unknown;
  }>(
    `/api/data/v9.2/opportunityproducts?$select=` +
      [
        "opportunityproductid",
        "_opportunityid_value",
        "_productid_value",
        "_uomid_value",
        "opportunityproductname",
        "productname",
        "new_uom",
        "quantity",
        "priceperunit",
        "extendedamount",
        "new_disc",
        "createdon",
      ].join(",") +
      `&$filter=_opportunityid_value eq ${opportunityId}`,
  );

  return rows.map<CrmOpportunityProduct>((row) => ({
    opportunityProductId: String(row.opportunityproductid ?? ""),
    opportunityId: String(row._opportunityid_value ?? opportunityId),
    productId: row._productid_value ?? null,
    productName:
      formatted(row as Record<string, unknown>, "_productid_value") ||
      normalizeText(row.productname ?? row.opportunityproductname),
    uomId: row._uomid_value ?? null,
    uomName:
      formatted(row as Record<string, unknown>, "_uomid_value") ||
      normalizeText(row.new_uom),
    quantity: Number(row.quantity ?? 0),
    pricePerUnit: Number(row.priceperunit ?? 0),
    extendedAmount: Number(row.extendedamount ?? 0),
    discount: Number(row.new_disc ?? 0),
    createdOn: row.createdon ?? null,
  }));
}

export async function getOpportunityActivities(opportunityId: string) {
  const rows = await dynamicsGetAll<{
    activityid?: string;
    subject?: string;
    activitytypecode?: string;
    createdon?: string;
    scheduledstart?: string;
    scheduledend?: string;
    statecode?: number;
    _ownerid_value?: string;
    [key: string]: unknown;
  }>(
    `/api/data/v9.2/activitypointers?$select=activityid,subject,activitytypecode,createdon,scheduledstart,scheduledend,statecode,_ownerid_value&$filter=_regardingobjectid_value eq ${opportunityId}&$orderby=createdon desc&$top=20`,
  );

  return rows.map((row) => ({
    activityId: normalizeText(row.activityid),
    subject: normalizeText(row.subject),
    type: normalizeText(row.activitytypecode),
    ownerId: row._ownerid_value ?? null,
    owner: formatted(row as Record<string, unknown>, "_ownerid_value"),
    status: formatted(row as Record<string, unknown>, "statecode"),
    createdOn: row.createdon ?? null,
    scheduledStart: row.scheduledstart ?? null,
    scheduledEnd: row.scheduledend ?? null,
  }));
}

export async function getOpportunityPartials(opportunityId: string) {
  const rows = await getOpportunityPartialsByIds([opportunityId]);
  return rows.sort((a, b) =>
    String(a.actualCloseDate ?? a.createdOn ?? "").localeCompare(
      String(b.actualCloseDate ?? b.createdOn ?? ""),
    ),
  );
}

export async function getOpportunityPartialsByIds(
  opportunityIds: string[],
  options: CrmQueryOptions = {},
) {
  const ids = [...new Set(opportunityIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const output: CrmOpportunityPartial[] = [];
  for (let index = 0; index < ids.length; index += 20) {
    throwIfCrmAborted(options.signal);
    const chunk = ids.slice(index, index + 20);
    const filter = chunk
      .map((id) => `_new_opportunity_value eq ${id}`)
      .join(" or ");

    const rows = await dynamicsGetAll<{
      new_opportunityhistorypartialid?: string;
      _new_opportunity_value?: string;
      _ownerid_value?: string;
      _new_existingproduct_value?: string;
      _new_unit_value?: string;
      new_productname?: string;
      new_quantity?: number;
      new_priceperunit?: number;
      new_amount?: number;
      new_extendedamount?: number;
      new_actualclosedatepartial?: string;
      createdon?: string;
      new_noopp?: string;
      new_ppicverified?: number;
      new_adminverified?: number;
      [key: string]: unknown;
    }>(
      `/api/data/v9.2/new_opportunityhistorypartials?$select=` +
        [
          "new_opportunityhistorypartialid",
          "_new_opportunity_value",
          "_ownerid_value",
          "_new_existingproduct_value",
          "_new_unit_value",
          "new_productname",
          "new_quantity",
          "new_priceperunit",
          "new_amount",
          "new_extendedamount",
          "new_actualclosedatepartial",
          "createdon",
          "new_noopp",
          "new_ppicverified",
          "new_adminverified",
        ].join(",") +
        `&$filter=${filter}`,
      options,
    );

    throwIfCrmAborted(options.signal);

    output.push(
      ...rows.map((row) => ({
        partialId: normalizeText(row.new_opportunityhistorypartialid),
        opportunityId: normalizeText(row._new_opportunity_value),
        opportunityNo: normalizeText(row.new_noopp),
        ownerId: row._ownerid_value ?? null,
        productId: row._new_existingproduct_value ?? null,
        productName: normalizeText(row.new_productname),
        uomId: row._new_unit_value ?? null,
        uomName: formatted(row as Record<string, unknown>, "_new_unit_value"),
        quantity: Number(row.new_quantity ?? 0),
        pricePerUnit: Number(row.new_priceperunit ?? 0),
        amount: Number(row.new_amount ?? 0),
        extendedAmount: Number(row.new_extendedamount ?? row.new_amount ?? 0),
        actualCloseDate: row.new_actualclosedatepartial ?? null,
        createdOn: row.createdon ?? null,
        ppicVerified: row.new_ppicverified ?? null,
        adminVerified: row.new_adminverified ?? null,
      })),
    );
  }

  return output;
}

export async function getOpportunityProductsByOpportunityIds(
  opportunityIds: string[],
  options: CrmQueryOptions = {},
) {
  const ids = [...new Set(opportunityIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const output: CrmOpportunityProduct[] = [];
  for (let index = 0; index < ids.length; index += 20) {
    throwIfCrmAborted(options.signal);
    const chunk = ids.slice(index, index + 20);
    const filter = chunk
      .map((id) => `_opportunityid_value eq ${id}`)
      .join(" or ");
    const rows = await dynamicsGetAll<{
      opportunityproductid?: string;
      _opportunityid_value?: string;
      _productid_value?: string;
      _uomid_value?: string;
      productname?: string;
      opportunityproductname?: string;
      new_uom?: string;
      quantity?: number;
      priceperunit?: number;
      extendedamount?: number;
      new_disc?: number;
      createdon?: string;
      [key: string]: unknown;
    }>(
      `/api/data/v9.2/opportunityproducts?$select=` +
        "opportunityproductid,_opportunityid_value,_productid_value,_uomid_value,productname,opportunityproductname,new_uom,quantity,priceperunit,extendedamount,new_disc,createdon" +
        `&$filter=${filter}`,
      options,
    );
    throwIfCrmAborted(options.signal);
    output.push(
      ...rows.map((row) => ({
        opportunityProductId: normalizeText(row.opportunityproductid),
        opportunityId: normalizeText(row._opportunityid_value),
        productId: row._productid_value ?? null,
        productName:
          formatted(row as Record<string, unknown>, "_productid_value") ||
          normalizeText(row.productname ?? row.opportunityproductname),
        uomId: row._uomid_value ?? null,
        uomName:
          formatted(row as Record<string, unknown>, "_uomid_value") ||
          normalizeText(row.new_uom),
        quantity: Number(row.quantity ?? 0),
        pricePerUnit: Number(row.priceperunit ?? 0),
        extendedAmount: Number(row.extendedamount ?? 0),
        discount: Number(row.new_disc ?? 0),
        createdOn: row.createdon ?? null,
      })),
    );
  }
  return output;
}

export async function findOpportunityIdsByProduct(productId: string) {
  const [currentRows, partialRows] = await Promise.all([
    dynamicsGetAll<{ _opportunityid_value?: string }>(
      `/api/data/v9.2/opportunityproducts?$select=_opportunityid_value&$filter=_productid_value eq ${productId}`,
    ),
    dynamicsGetAll<{ _new_opportunity_value?: string }>(
      `/api/data/v9.2/new_opportunityhistorypartials?$select=_new_opportunity_value&$filter=_new_existingproduct_value eq ${productId}`,
    ),
  ]);

  return [
    ...new Set(
      [
        ...currentRows.map((row) => normalizeText(row._opportunityid_value)),
        ...partialRows.map((row) => normalizeText(row._new_opportunity_value)),
      ].filter(Boolean),
    ),
  ];
}

export async function queryOpportunityActualRevenueByDate(
  input: {
    from: string;
    to: string;
    salesmanId?: string;
    customerId?: string;
    opportunityId?: string;
  },
  options: CrmQueryOptions = {},
): Promise<CrmOpportunityActualRevenueEvent[]> {
  throwIfCrmAborted(options.signal);

  const filters: string[] = [];
  pushDateRangeFilters(filters, "actualclosedate", input.from, input.to);

  if (input.salesmanId) {
    filters.push(`_ownerid_value eq ${input.salesmanId}`);
  }

  if (input.customerId) {
    filters.push(`_customerid_value eq ${input.customerId}`);
  }

  if (input.opportunityId) {
    filters.push(`opportunityid eq ${input.opportunityId}`);
  }

  const filterText =
    filters.length > 0 ? `&$filter=${filters.join(" and ")}` : "";

  const rows = await dynamicsGetAll<{
    opportunityid?: string;
    new_noopp?: string;
    name?: string;
    _customerid_value?: string;
    _ownerid_value?: string;
    statecode?: number;
    actualvalue?: number;
    actualclosedate?: string;
  }>(
    `/api/data/v9.2/opportunities?$select=` +
      [
        "opportunityid",
        "new_noopp",
        "name",
        "_customerid_value",
        "_ownerid_value",
        "statecode",
        "actualvalue",
        "actualclosedate",
      ].join(",") +
      filterText,
    options,
  );

  throwIfCrmAborted(options.signal);

  return rows.map((row) => ({
    opportunityId: normalizeText(row.opportunityid),
    noOpp: normalizeText(row.new_noopp),
    name: normalizeText(row.name),
    customerId: row._customerid_value ?? null,
    ownerId: row._ownerid_value ?? null,
    stateCode: row.statecode ?? null,
    actualValue: Number(row.actualvalue ?? 0),
    actualCloseDate: row.actualclosedate ?? null,
  }));
}

export async function queryPartialRevenueByDate(
  input: {
    from: string;
    to: string;
    salesmanId?: string;
    customerId?: string;
    opportunityId?: string;
    productId?: string;
  },
  options: CrmQueryOptions = {},
): Promise<CrmPartialRevenueEvent[]> {
  throwIfCrmAborted(options.signal);

  const filters: string[] = [];
  pushDateRangeFilters(
    filters,
    "new_actualclosedatepartial",
    input.from,
    input.to,
  );

  if (input.salesmanId) {
    filters.push(`_ownerid_value eq ${input.salesmanId}`);
  }

  if (input.customerId) {
    filters.push(`_cr4fb_accountpartial_value eq ${input.customerId}`);
  }

  if (input.opportunityId) {
    filters.push(`_new_opportunity_value eq ${input.opportunityId}`);
  }

  if (input.productId) {
    filters.push(`_new_existingproduct_value eq ${input.productId}`);
  }

  const filterText =
    filters.length > 0 ? `&$filter=${filters.join(" and ")}` : "";

  const rows = await dynamicsGetAll<{
    new_opportunityhistorypartialid?: string;
    _new_opportunity_value?: string;
    new_noopp?: string;
    _cr4fb_accountpartial_value?: string;
    _ownerid_value?: string;
    _new_existingproduct_value?: string;
    new_productname?: string;
    new_extendedamount?: number;
    new_amount?: number;
    new_actualclosedatepartial?: string;
  }>(
    `/api/data/v9.2/new_opportunityhistorypartials?$select=` +
      [
        "new_opportunityhistorypartialid",
        "_new_opportunity_value",
        "new_noopp",
        "_cr4fb_accountpartial_value",
        "_ownerid_value",
        "_new_existingproduct_value",
        "new_productname",
        "new_extendedamount",
        "new_amount",
        "new_actualclosedatepartial",
      ].join(",") +
      filterText,
    options,
  );

  throwIfCrmAborted(options.signal);

  return rows.map((row) => ({
    partialId: normalizeText(row.new_opportunityhistorypartialid),
    opportunityId: normalizeText(row._new_opportunity_value),
    opportunityNo: normalizeText(row.new_noopp),
    customerId: row._cr4fb_accountpartial_value ?? null,
    ownerId: row._ownerid_value ?? null,
    productId: row._new_existingproduct_value ?? null,
    productName: normalizeText(row.new_productname),
    extendedAmount: Number(row.new_extendedamount ?? row.new_amount ?? 0),
    actualCloseDate: row.new_actualclosedatepartial ?? null,
  }));
}

export async function getOpportunityDimensionRefsByIds(
  opportunityIds: string[],
  options: CrmQueryOptions = {},
): Promise<CrmOpportunityDimensionRef[]> {
  const ids = [...new Set(opportunityIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const output: CrmOpportunityDimensionRef[] = [];

  for (let index = 0; index < ids.length; index += 20) {
    throwIfCrmAborted(options.signal);

    const chunk = ids.slice(index, index + 20);
    const filter = chunk.map((id) => `opportunityid eq ${id}`).join(" or ");

    const rows = await dynamicsGetAll<{
      opportunityid?: string;
      new_noopp?: string;
      name?: string;
      _customerid_value?: string;
      _ownerid_value?: string;
    }>(
      `/api/data/v9.2/opportunities?$select=opportunityid,new_noopp,name,_customerid_value,_ownerid_value&$filter=(${filter})`,
      options,
    );

    output.push(
      ...rows.map((row) => ({
        opportunityId: normalizeText(row.opportunityid),
        noOpp: normalizeText(row.new_noopp),
        name: normalizeText(row.name),
        customerId: row._customerid_value ?? null,
        ownerId: row._ownerid_value ?? null,
      })),
    );
  }

  throwIfCrmAborted(options.signal);
  return output;
}

export async function getOpportunityCustomerRefsByIds(
  opportunityIds: string[],
  options: CrmQueryOptions = {},
) {
  const rows = await getOpportunityDimensionRefsByIds(opportunityIds, options);
  return rows.map((row) => ({
    opportunityId: row.opportunityId,
    customerId: row.customerId,
  }));
}

export async function getSystemUsersByIds(
  systemUserIds: string[],
  options: CrmQueryOptions = {},
): Promise<CrmSystemUserRef[]> {
  const ids = [...new Set(systemUserIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const output: CrmSystemUserRef[] = [];

  for (let index = 0; index < ids.length; index += 20) {
    throwIfCrmAborted(options.signal);

    const chunk = ids.slice(index, index + 20);
    const filter = chunk.map((id) => `systemuserid eq ${id}`).join(" or ");

    const rows = await dynamicsGetAll<{
      systemuserid?: string;
      fullname?: string;
    }>(
      `/api/data/v9.2/systemusers?$select=systemuserid,fullname&$filter=(${filter})`,
      options,
    );

    output.push(
      ...rows
        .map((row) => ({
          systemUserId: normalizeText(row.systemuserid),
          name: normalizeText(row.fullname),
        }))
        .filter((row) => row.systemUserId),
    );
  }

  throwIfCrmAborted(options.signal);
  return output;
}

export async function getAccountsByIds(
  accountIds: string[],
  options: CrmQueryOptions = {},
): Promise<CrmAccountRef[]> {
  const ids = [...new Set(accountIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const output: CrmAccountRef[] = [];

  for (let index = 0; index < ids.length; index += 20) {
    throwIfCrmAborted(options.signal);

    const chunk = ids.slice(index, index + 20);
    const filter = chunk.map((id) => `accountid eq ${id}`).join(" or ");

    const rows = await dynamicsGetAll<{
      accountid?: string;
      name?: string;
    }>(
      `/api/data/v9.2/accounts?$select=accountid,name&$filter=(${filter})`,
      options,
    );

    output.push(
      ...rows
        .map((row) => ({
          accountId: normalizeText(row.accountid),
          name: normalizeText(row.name),
        }))
        .filter((row) => row.accountId),
    );
  }

  throwIfCrmAborted(options.signal);
  return output;
}

export async function queryOpportunities(
  input: {
    salesmanId?: string;
    customerId?: string;
    opportunityId?: string;
    opportunityIds?: string[];
    status?: "open" | "won" | "lost" | "all";
  },
  options: CrmQueryOptions = {},
) {
  throwIfCrmAborted(options.signal);
  const filters: string[] = [];
  if (input.salesmanId) filters.push(`_ownerid_value eq ${input.salesmanId}`);
  if (input.customerId)
    filters.push(`_customerid_value eq ${input.customerId}`);
  if (input.opportunityId)
    filters.push(`opportunityid eq ${input.opportunityId}`);

  const ids = [...new Set(input.opportunityIds?.filter(Boolean) ?? [])];
  if (ids.length > 0) {
    filters.push(`(${ids.map((id) => `opportunityid eq ${id}`).join(" or ")})`);
  }

  if (input.status && input.status !== "all") {
    const state = input.status === "open" ? 0 : input.status === "won" ? 1 : 2;
    filters.push(`statecode eq ${state}`);
  }

  const filterText =
    filters.length > 0 ? `&$filter=${filters.join(" and ")}` : "";
  const rows = await dynamicsGetAll<OpportunityRow>(
    `/api/data/v9.2/opportunities?$select=${opportunitySelect}${filterText}`,
    options,
  );
  throwIfCrmAborted(options.signal);
  return rows.map(mapOpportunity);
}
