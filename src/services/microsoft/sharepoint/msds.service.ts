import { env } from "../../../config/env.js";
import { getSharePointSite, graphGet } from "./sharepoint-client.js";
import { escapeODataString } from "../../../utils/odata.util.js";

type SharePointList = {
  id: string;
  name?: string;
  displayName?: string;
  webUrl?: string;
};

type SharePointListResponse = {
  value: SharePointList[];
};

type MsdsListItemResponse = {
  value: Array<{
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
  }>;
};

export type MsdsDocument = {
  id: string;
  itemNumber: string;
  fileName: string | null;
  category: string | null;
  url: string | null;
  sharePointUrl: string | null;
  remarks: string | null;
  lastModifiedDateTime: string | null;
};

export type MsdsLookupResult = {
  found: boolean;
  itemNumber: string | null;
  totalDocuments: number;
  documents: MsdsDocument[];
  message?: string;
};

async function getMsdsList() {
  const site = await getSharePointSite();
  const result = await graphGet<SharePointListResponse>(
    `/sites/${encodeURIComponent(site.id)}/lists`,
    { $select: "id,name,displayName,webUrl" },
  );

  const targetName = env.SHAREPOINT_MSDS_LIBRARY_NAME.trim().toLowerCase();
  const list = result.value.find(
    (item) =>
      String(item.displayName ?? item.name ?? "")
        .trim()
        .toLowerCase() === targetName,
  );

  if (!list) {
    return { found: false as const, site, list: null };
  }

  return { found: true as const, site, list };
}

function normalizeItemNumber(value: string) {
  return String(value ?? "").trim().toUpperCase();
}

function emptyLookup(itemNumber: string | null, message?: string): MsdsLookupResult {
  return {
    found: false,
    itemNumber,
    totalDocuments: 0,
    documents: [],
    ...(message ? { message } : {}),
  };
}

export async function findMsdsByItemNumbers(
  itemNumbers: string[],
): Promise<Record<string, MsdsLookupResult>> {
  const codes = Array.from(
    new Set(itemNumbers.map(normalizeItemNumber).filter(Boolean)),
  );

  if (codes.length === 0) return {};

  const msdsList = await getMsdsList();
  if (!msdsList.found || !msdsList.list) {
    return Object.fromEntries(
      codes.map((code) => [
        code,
        emptyLookup(code, "MSDS File list tidak ditemukan."),
      ]),
    );
  }

  const itemFilter = codes
    .map((code) => `fields/IDMaster eq '${escapeODataString(code)}'`)
    .join(" or ");

  const result = await graphGet<MsdsListItemResponse>(
    `/sites/${encodeURIComponent(msdsList.site.id)}` +
      `/lists/${encodeURIComponent(msdsList.list.id)}` +
      `/items`,
    {
      $expand:
        "fields($select=FileLeafRef,IDMaster,Category,URL,remarks,IsDeleted)",
      $filter: `(${itemFilter})`,
      $top: String(Math.max(100, codes.length * 20)),
    },
    { Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly" },
  );

  const grouped = new Map<string, MsdsDocument[]>();

  for (const item of result.value) {
    const deleted = item.fields?.IsDeleted;
    if (deleted === true || deleted === 1 || deleted === "1") continue;

    const code = normalizeItemNumber(item.fields?.IDMaster ?? "");
    if (!code || !codes.includes(code)) continue;

    const document: MsdsDocument = {
      id: item.id,
      itemNumber: code,
      fileName: item.fields?.FileLeafRef ?? null,
      category: item.fields?.Category ?? null,
      url: item.fields?.URL ?? item.webUrl ?? null,
      sharePointUrl: item.webUrl ?? null,
      remarks: item.fields?.remarks ?? null,
      lastModifiedDateTime: item.lastModifiedDateTime ?? null,
    };

    const documents = grouped.get(code) ?? [];
    documents.push(document);
    grouped.set(code, documents);
  }

  return Object.fromEntries(
    codes.map((code) => {
      const documents = grouped.get(code) ?? [];
      return [
        code,
        {
          found: documents.length > 0,
          itemNumber: code,
          totalDocuments: documents.length,
          documents,
        } satisfies MsdsLookupResult,
      ];
    }),
  );
}

export async function findMsdsByItemNumber(
  itemNumber: string,
): Promise<MsdsLookupResult> {
  const code = normalizeItemNumber(itemNumber);
  if (!code) return emptyLookup(null);

  const results = await findMsdsByItemNumbers([code]);
  return results[code] ?? emptyLookup(code);
}
