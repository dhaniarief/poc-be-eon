import { env } from "../../../config/env.js";
import {
  getSharePointSiteByPath,
  graphGet,
  graphGetAbsolute,
  graphGetBuffer,
} from "./sharepoint-client.js";

export type ProductKnowledgeDeltaChange = {
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

type ListItemFields = Record<string, unknown> & {
  Title?: unknown;
  FileLeafRef?: unknown;
  FileRef?: unknown;
  Category?: unknown;
  ProductName?: unknown;
  IndustryType?: unknown;
  Application?: unknown;
  Equipment?: unknown;
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

type DriveItemResponse = {
  id: string;
  name?: string;
  webUrl?: string;
  eTag?: string;
  cTag?: string;
  size?: number;
  lastModifiedDateTime?: string;
  file?: {
    mimeType?: string;
    hashes?: {
      quickXorHash?: string;
      sha1Hash?: string;
      sha256Hash?: string;
    };
  };
  parentReference?: {
    driveId?: string;
  };
};

export type ProductKnowledgeDocument = {
  id: string;
  title: string;
  fileName: string | null;
  fileRef: string | null;
  category: string | null;
  productName: string | null;
  industryTypes: string[];
  applications: string[];
  equipment: string[];
  webUrl: string | null;
  eTag: string | null;
  modifiedAt: string | null;
  driveId: string;
  driveItemId: string;
  mimeType: string | null;
  size: number | null;
};

const PRODUCT_FIELDS = [
  "Title",
  "FileLeafRef",
  "FileRef",
  "Category",
  "ProductName",
  "IndustryType",
  "Application",
  "Equipment",
  "Modified",
].join(",");

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = normalizeWhitespace(String(value));
  return text || null;
}

function asChoiceArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeWhitespace(String(item)))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    if (trimmed.includes(";#")) {
      return trimmed
        .split(";#")
        .map((item) => normalizeWhitespace(item))
        .filter(Boolean);
    }

    return [normalizeWhitespace(trimmed)].filter(Boolean);
  }

  return [];
}

function asDelimitedTextArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => asDelimitedTextArray(item))
      .filter(Boolean);
  }

  if (typeof value !== "string") return [];

  return value
    .split(/;#|;|\r?\n/g)
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean);
}

function stripPdfExtension(fileName: string | null) {
  return fileName?.replace(/\.pdf$/i, "").trim() || null;
}

export async function getProductKnowledgeSiteContext() {
  const site = await getSharePointSiteByPath(
    env.SHAREPOINT_PRODUCT_HOSTNAME,
    env.SHAREPOINT_PRODUCT_SITE_PATH,
  );

  return {
    site,
    listId: env.SHAREPOINT_PRODUCT_LIST_ID.trim(),
  };
}

export async function readProductKnowledgeDelta(input: {
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

  const latestById = new Map<string, ProductKnowledgeDeltaChange>();

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
    throw new Error(
      "Microsoft Graph Product Knowledge delta response did not return @odata.deltaLink.",
    );
  }

  return {
    changes: Array.from(latestById.values()),
    deltaLink,
  };
}

export async function getProductKnowledgeDocumentByItemId(input: {
  siteId: string;
  listId: string;
  itemId: string;
}): Promise<ProductKnowledgeDocument> {
  const item = await graphGet<ListItemResponse>(
    `/sites/${encodeURIComponent(input.siteId)}` +
      `/lists/${encodeURIComponent(input.listId)}` +
      `/items/${encodeURIComponent(input.itemId)}`,
    {
      $select: "id,eTag,webUrl,lastModifiedDateTime",
      $expand: `fields($select=${PRODUCT_FIELDS})`,
    },
  );

  const driveItem = await graphGet<DriveItemResponse>(
    `/sites/${encodeURIComponent(input.siteId)}` +
      `/lists/${encodeURIComponent(input.listId)}` +
      `/items/${encodeURIComponent(input.itemId)}/driveItem`,
    {
      $select:
        "id,name,webUrl,eTag,cTag,size,lastModifiedDateTime,file,parentReference",
    },
  );

  const driveId = driveItem.parentReference?.driveId?.trim();
  if (!driveId) {
    throw new Error(
      `Product Knowledge item ${input.itemId} does not expose parentReference.driveId.`,
    );
  }

  const fields = item.fields ?? {};
  const fileName =
    asNullableString(fields.FileLeafRef) ??
    asNullableString(driveItem.name);

  const title =
    asNullableString(fields.Title) ??
    stripPdfExtension(fileName) ??
    `Product Knowledge ${item.id}`;

  return {
    id: item.id,
    title,
    fileName,
    fileRef: asNullableString(fields.FileRef),
    category: asNullableString(fields.Category),
    productName: asNullableString(fields.ProductName),
    industryTypes: asChoiceArray(fields.IndustryType),
    applications: asDelimitedTextArray(fields.Application),
    equipment: asDelimitedTextArray(fields.Equipment),
    webUrl: driveItem.webUrl ?? item.webUrl ?? null,
    eTag:
      item.eTag ??
      item["@odata.etag"] ??
      driveItem.eTag ??
      driveItem.cTag ??
      null,
    modifiedAt:
      driveItem.lastModifiedDateTime ??
      item.lastModifiedDateTime ??
      asNullableString(fields.Modified) ??
      null,
    driveId,
    driveItemId: driveItem.id,
    mimeType: driveItem.file?.mimeType ?? null,
    size:
      typeof driveItem.size === "number" && Number.isFinite(driveItem.size)
        ? driveItem.size
        : null,
  };
}

export async function downloadProductKnowledgeFile(
  document: Pick<ProductKnowledgeDocument, "driveId" | "driveItemId">,
) {
  return graphGetBuffer(
    `/drives/${encodeURIComponent(document.driveId)}` +
      `/items/${encodeURIComponent(document.driveItemId)}/content`,
  );
}
