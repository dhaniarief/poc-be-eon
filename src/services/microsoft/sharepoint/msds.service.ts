import { env } from "../../../config/env.js";
import { getSharePointSite, graphGet } from "./sharepoint-client.js";

import { escapeODataString } from "../../../utils/odata.util.js";
import { normalizeText } from "../../../utils/text.util.js";

type SharePointList = {
  id: string;
  name?: string;
  displayName?: string;
  webUrl?: string;
};

type MsdsListItem = {
  id: string;

  webUrl?: string;

  lastModifiedDateTime?: string;

  fields?: {
    FileLeafRef?: string;
    IDMaster?: string;
    Category?: string;
    URL?: string;
    remarks?: string;
    IsDeleted?: boolean | number | string;
  };
};

export type MsdsDocument = {
  id: string;

  productName: string;

  fileName: string;

  category: string;

  url: string | null;

  sharePointUrl: string | null;

  remarks: string | null;

  modifiedAt: string | null;
};

let listCache: {
  siteId: string;
  listId: string;
} | null = null;

/**
 * CRM/user product name:
 *
 * EONWASH 500
 *
 * becomes:
 *
 * EONWASH_500
 *
 * and can match:
 *
 * EONWASH_500_FGxxxxx.pdf
 */
function filePrefix(productName: string) {
  return normalizeText(productName)
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function isDeleted(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

/**
 * Resolve the MSDS File SharePoint library once,
 * then reuse its IDs.
 */
async function getMsdsList() {
  if (listCache) {
    return listCache;
  }

  const site = await getSharePointSite();

  const result = await graphGet<{
    value: SharePointList[];
  }>(`/sites/${encodeURIComponent(site.id)}/lists`, {
    $select: "id,name,displayName,webUrl",
  });

  const target = normalizeText(env.SHAREPOINT_MSDS_LIBRARY_NAME).toLowerCase();

  const list = result.value.find((item) => {
    const name = normalizeText(item.displayName ?? item.name).toLowerCase();

    return name === target;
  });

  if (!list) {
    throw new Error(
      `SharePoint list not found: ${env.SHAREPOINT_MSDS_LIBRARY_NAME}`,
    );
  }

  listCache = {
    siteId: site.id,
    listId: list.id,
  };

  return listCache;
}

export async function findMsdsByProductName(productName: string) {
  const canonicalName = normalizeText(productName);

  const prefix = filePrefix(canonicalName);

  if (!canonicalName || !prefix) {
    return {
      productName: canonicalName,
      found: false,
      document: null,
      documents: [],
    };
  }

  const { siteId, listId } = await getMsdsList();

  const escapedPrefix = escapeODataString(prefix);

  const result = await graphGet<{
    value: MsdsListItem[];
  }>(
    `/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(
      listId,
    )}/items`,
    {
      $expand:
        "fields($select=FileLeafRef,IDMaster,Category,URL,remarks,IsDeleted)",

      $filter:
        `fields/Category eq 'MSDS for Email' and ` +
        `startswith(fields/FileLeafRef,'${escapedPrefix}')`,

      $top: "100",
    },
    {
      Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly",
    },
  );

  const documents = result.value

    // Ignore logically deleted documents.
    .filter((item) => !isDeleted(item.fields?.IsDeleted))

    // Safety filter even though Graph already filters it.
    .filter(
      (item) =>
        normalizeText(item.fields?.Category).toLowerCase() === "msds for email",
    )

    // Safety filename matching.
    .filter((item) =>
      normalizeText(item.fields?.FileLeafRef).toUpperCase().startsWith(prefix),
    )

    .map<MsdsDocument>((item) => ({
      id: item.id,

      productName: canonicalName,

      fileName: normalizeText(item.fields?.FileLeafRef),

      category: normalizeText(item.fields?.Category),

      url: normalizeText(item.fields?.URL) || item.webUrl || null,

      sharePointUrl: item.webUrl ?? null,

      remarks: normalizeText(item.fields?.remarks) || null,

      modifiedAt: item.lastModifiedDateTime ?? null,
    }))

    // Latest document first.
    .sort((a, b) =>
      String(b.modifiedAt ?? "").localeCompare(String(a.modifiedAt ?? "")),
    );

  return {
    productName: canonicalName,

    found: documents.length > 0,

    document: documents[0] ?? null,

    documents,
  };
}

export async function findMsdsByProductNames(productNames: string[]) {
  const names = [...new Set(productNames.map(normalizeText).filter(Boolean))];

  const results = await Promise.all(names.map(findMsdsByProductName));

  return Object.fromEntries(
    results.map((result) => [result.productName, result]),
  );
}
