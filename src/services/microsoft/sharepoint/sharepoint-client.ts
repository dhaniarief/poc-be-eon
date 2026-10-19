import { env } from "../../../config/env.js";
import { writeBusinessEvent } from "../../../logging/operation-logger.js";
import { getMicrosoftAccessToken } from "../auth/microsoft-auth.service.js";

type GraphParams = Record<string, string | number>;

export class GraphApiError extends Error {
  status: number;
  location: string | null;

  constructor(input: { status: number; location?: string | null }) {
    super(`Microsoft Graph API failed with status ${input.status}`);
    this.name = "GraphApiError";
    this.status = input.status;
    this.location = input.location ?? null;
  }
}

async function getSharePointAccessToken() {
  return getMicrosoftAccessToken({
    cacheKey: "sharepoint",
    scope: "https://graph.microsoft.com/.default",
  });
}

async function graphResponse(
  url: URL,
  input?: {
    accept?: string;
    extraHeaders?: Record<string, string>;
  },
) {
  const token = await getSharePointAccessToken();

  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: input?.accept ?? "application/json",
      ...(input?.extraHeaders ?? {}),
    },
  });

  if (!response.ok) {
    writeBusinessEvent("error", "INTEGRATION_ERROR", {
      source: "sharepoint",
      operation: "GRAPH_GET",
      statusCode: response.status,
      path: url.pathname,
    });

    throw new GraphApiError({
      status: response.status,
      location: response.headers.get("location"),
    });
  }

  return response;
}

async function graphFetch<T>(
  url: URL,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const response = await graphResponse(url, {
    accept: "application/json",
    extraHeaders,
  });

  return (await response.json()) as T;
}

export async function graphGet<T>(
  path: string,
  params?: GraphParams,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const url = new URL(`https://graph.microsoft.com/v1.0${path}`);

  Object.entries(params ?? {}).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });

  return graphFetch<T>(url, extraHeaders);
}

export async function graphGetAbsolute<T>(
  absoluteUrl: string,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const url = new URL(absoluteUrl);

  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "graph.microsoft.com"
  ) {
    throw new Error("Only Microsoft Graph HTTPS URLs are allowed.");
  }

  return graphFetch<T>(url, extraHeaders);
}

/**
 * Download binary content from Microsoft Graph.
 * Used by Product Knowledge to download the actual PDF bytes.
 */
export async function graphGetBuffer(
  path: string,
  params?: GraphParams,
): Promise<Buffer> {
  const url = new URL(`https://graph.microsoft.com/v1.0${path}`);

  Object.entries(params ?? {}).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });

  const response = await graphResponse(url, {
    accept: "application/octet-stream,application/pdf,*/*",
  });

  return Buffer.from(await response.arrayBuffer());
}

export async function getSharePointSiteByPath(
  hostname: string,
  rawSitePath: string,
) {
  const normalizedHostname = hostname.trim();
  const sitePath = rawSitePath.trim().replace(/^\/+/, "").replace(/\/+$/, "");

  const path = sitePath
    ? `/sites/${normalizedHostname}:/${sitePath}`
    : `/sites/${normalizedHostname}`;

  const result = await graphGet<{
    id: string;
    name?: string;
    displayName?: string;
    webUrl?: string;
  }>(path, {
    $select: "id,name,displayName,webUrl",
  });

  return {
    id: result.id,
    name: result.name ?? null,
    displayName: result.displayName ?? null,
    webUrl: result.webUrl ?? null,
  };
}

export async function getSharePointSite() {
  return getSharePointSiteByPath(
    env.SHAREPOINT_HOSTNAME,
    env.SHAREPOINT_SITE_PATH,
  );
}
