import { env } from "../../../config/env.js";
import {
  getSharePointSiteByPath,
  graphGet,
  graphGetAbsolute,
} from "./sharepoint-client.js";

export type SopIkDeltaChange = {
  id: string;
  deleted: boolean;
};

type DeltaListItem = {
  id: string;
  deleted?: {
    state?: string;
  };
};

type DeltaResponse = {
  value?: DeltaListItem[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
};

export type SopIkPage = {
  id: string;
  title: string;
  fileName: string | null;
  fileRef: string | null;
  docNumber: string | null;
  docType: string | null;
  process: string | null;
  status: string | null;
  effectiveFrom: string | null;
  validTo: string | null;
  reminderToUpdate: string | null;
  docVersion: number | null;
  managerApprovalStatus: string | null;
  qaApprovalStatus: string | null;
  canvasContent1: string;
  webUrl: string | null;
  eTag: string | null;
  modifiedAt: string | null;
};

type ListItemFields = Record<string, unknown> & {
  Title?: unknown;
  FileLeafRef?: unknown;
  FileRef?: unknown;
  DocNumber?: unknown;
  DocType?: unknown;
  Process?: unknown;
  Status?: unknown;
  EffectiveFrom?: unknown;
  Valid_x0020_To?: unknown;
  ReminderToUpdate?: unknown;
  DocVersion?: unknown;
  ManagerApprovalStatus?: unknown;
  QAApprovalStatus?: unknown;
  CanvasContent1?: unknown;
  Modified?: unknown;
};

type ListItemResponse = {
  id: string;
  eTag?: string;
  "@odata.etag"?: string;
  webUrl?: string;
  lastModifiedDateTime?: string;
  fields?: ListItemFields;
};

const PAGE_FIELDS = [
  "Title",
  "FileLeafRef",
  "FileRef",
  "DocNumber",
  "DocType",
  "Process",
  "Status",
  "EffectiveFrom",
  "Valid_x0020_To",
  "ReminderToUpdate",
  "DocVersion",
  "ManagerApprovalStatus",
  "QAApprovalStatus",
  "CanvasContent1",
  "Modified",
].join(",");

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export async function getSopIkSiteContext() {
  const site = await getSharePointSiteByPath(
    env.SHAREPOINT_SOP_HOSTNAME,
    env.SHAREPOINT_SOP_SITE_PATH,
  );

  return {
    site,
    listId: env.SHAREPOINT_SOP_LIST_ID.trim(),
  };
}

export async function readSopIkDelta(input: {
  siteId: string;
  listId: string;
  deltaLink?: string | null;
}) {
  let response: DeltaResponse;

  if (input.deltaLink) {
    response = await graphGetAbsolute<DeltaResponse>(input.deltaLink);
  } else {
    response = await graphGet<DeltaResponse>(
      `/sites/${encodeURIComponent(input.siteId)}` +
        `/lists/${encodeURIComponent(input.listId)}` +
        `/items/delta`,
      { $top: 200 },
    );
  }

  const latestById = new Map<string, SopIkDeltaChange>();

  while (true) {
    for (const item of response.value ?? []) {
      if (!item?.id) continue;

      latestById.set(item.id, {
        id: item.id,
        deleted: Boolean(item.deleted),
      });
    }

    const nextLink = response["@odata.nextLink"];
    if (!nextLink) break;

    response = await graphGetAbsolute<DeltaResponse>(nextLink);
  }

  const deltaLink = response["@odata.deltaLink"];
  if (!deltaLink) {
    throw new Error("Microsoft Graph delta response did not return @odata.deltaLink.");
  }

  return {
    changes: Array.from(latestById.values()),
    deltaLink,
  };
}

export async function getSopIkPageByItemId(input: {
  siteId: string;
  listId: string;
  itemId: string;
}): Promise<SopIkPage> {
  const result = await graphGet<ListItemResponse>(
    `/sites/${encodeURIComponent(input.siteId)}` +
      `/lists/${encodeURIComponent(input.listId)}` +
      `/items/${encodeURIComponent(input.itemId)}`,
    {
      $select: "id,eTag,webUrl,lastModifiedDateTime",
      $expand: `fields($select=${PAGE_FIELDS})`,
    },
  );

  const fields = result.fields ?? {};
  const fileName = asNullableString(fields.FileLeafRef);
  const title =
    asNullableString(fields.Title) ??
    fileName?.replace(/\.aspx$/i, "") ??
    `SharePoint Item ${result.id}`;

  return {
    id: result.id,
    title,
    fileName,
    fileRef: asNullableString(fields.FileRef),
    docNumber: asNullableString(fields.DocNumber),
    docType: asNullableString(fields.DocType),
    process: asNullableString(fields.Process),
    status: asNullableString(fields.Status),
    effectiveFrom: asNullableString(fields.EffectiveFrom),
    validTo: asNullableString(fields.Valid_x0020_To),
    reminderToUpdate: asNullableString(fields.ReminderToUpdate),
    docVersion: asNullableNumber(fields.DocVersion),
    managerApprovalStatus: asNullableString(fields.ManagerApprovalStatus),
    qaApprovalStatus: asNullableString(fields.QAApprovalStatus),
    canvasContent1: asNullableString(fields.CanvasContent1) ?? "",
    webUrl: result.webUrl ?? null,
    eTag: result.eTag ?? result["@odata.etag"] ?? null,
    modifiedAt:
      result.lastModifiedDateTime ?? asNullableString(fields.Modified) ?? null,
  };
}
